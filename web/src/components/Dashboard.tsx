'use client';
// Dashboard principal — CU-01..CU-09, CU-12, CU-13. WCAG AA básico (RNF-09):
// roles/aria-labels en cifras económicas, contraste AA, foco visible, estados de error D7.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAIN, CONTRACTS, RATE_WEI_PER_SEC, formatEur } from '@/config/web3';
import {
  AccountInfo, activeChainId, claimSettled, closeFlow, connectWallet, createFlow,
  downgradeFromEuroX, getAccountInfo, getFlow, getOpenOutflows, getRealtimeBalance, humanizeError,
  incomingUnclaimed, pauseFlow, resumeFlow, settle, upgradeToEuroX,
} from '@/lib/superfluid';
import { usePolledData } from '@/lib/polling';
// Fase 4 (pruebas): lógica pura extraída a ui-logic.ts (misma semántica, testeable sin React).
import { PAGE_SIZE, parseEur, paginate, validateReceiver as validateReceiverPure } from '@/lib/ui-logic';

type Toast = { kind: 'ok' | 'error' | 'warn'; msg: string };

export default function Dashboard() {
  const [account, setAccount] = useState<string | null>(null);
  const [wrongNet, setWrongNet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [receiverInput, setReceiverInput] = useState('');
  const [wrapInput, setWrapInput] = useState('100');
  const [unwrapInput, setUnwrapInput] = useState('50');
  const [showIrrevocableModal, setShowIrrevocableModal] = useState(false);
  const [knownSenders, setKnownSenders] = useState<string[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((t: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // CU-09: conectar + guard de red (RE-09a)
  const onConnect = useCallback(async () => {
    try {
      const accs = await connectWallet();
      if (!accs.length) return;
      setAccount(accs[0]);
      const cid = await activeChainId();
      setWrongNet(cid !== null && cid !== CHAIN.chainId);
    } catch (e) {
      notify({ kind: 'error', msg: humanizeError(e) });
    }
  }, [notify]);

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { on?: (ev: string, h: (a: unknown) => void) => void } }).ethereum;
    if (!eth?.on) return;
    const handleChain = async () => {
      const cid = await activeChainId();
      setWrongNet(cid !== null && cid !== CHAIN.chainId);
    };
    const handleAccounts = async (a: unknown) => {
      setAccount(Array.isArray(a) && a.length ? String(a[0]) : null);
      await handleChain(); // la red puede ser por-cuenta: revalidar
    };
    eth.on?.('accountsChanged', handleAccounts);
    eth.on?.('chainChanged', handleChain);
    return () => {
      const w = window as unknown as { ethereum?: { removeListener?: (ev: string, h: (a: unknown) => void) => void } };
      w.ethereum?.removeListener?.('accountsChanged', handleAccounts);
      w.ethereum?.removeListener?.('chainChanged', handleChain);
    };
  }, []);

  // CU-04/RF-08: balances live con polling §RE-04
  const fetcher = useCallback(async () => {
    if (!account) return null;
    const bal = await getRealtimeBalance(account);
    const outflows = await getOpenOutflows(account);
    const flows = await Promise.all(outflows.map(async (r) => {
      const f = await getFlow(account, r);
      return { receiver: r, ...(f ?? { flowRate: BigInt(0), status: 0 as const, accumulatedBalance: BigInt(0), virtualDevengo: BigInt(0) }) };
    }));
    const inc = await incomingUnclaimed(account, knownSenders);
    return { ...bal, flows, incomingTotal: inc.total, perSender: inc.perSender };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, knownSenders]);

  const poll = usePolledData(fetcher, !!account, account ?? undefined);
  const data = poll.data;

  useEffect(() => {
    // suscripción ligera de sesión: escucha FlowCreated hacia nuestra cuenta desde último bloque visto
    if (!account) return;
    let lastBlock = 0;
    const tickLogs = async () => {
      try {
        const { ethers } = await import('ethers');
        const { getReadProvider } = await import('@/lib/superfluid');
        const provider = getReadProvider();
        const num = await provider.getBlockNumber();
        if (lastBlock === 0) lastBlock = Math.max(num - 1500, 0); // ~50 min de historia (block 2 s)
        if (num <= lastBlock) return;
        const iface = new ethers.utils.Interface([
          'event FlowCreated(address indexed sender, address indexed receiver, int96 flowRate)',
        ]);
        const logs = await provider.getLogs({
          address: CONTRACTS.EURx,
          topics: [
            iface.getEventTopic('FlowCreated'),
            null,
            ethers.utils.hexZeroPad(account.toLowerCase(), 32),
          ],
          fromBlock: lastBlock + 1,
          toBlock: num,
        });
        const found: string[] = [];
        for (const l of logs) {
          try {
            const ev = iface.parseLog(l);
            if (ev && String(ev.args.receiver).toLowerCase() === account.toLowerCase()) {
              found.push(String(ev.args.sender));
            }
          } catch { /* log de otro evento */ }
        }
        lastBlock = num;
        if (found.length) {
          setKnownSenders((prev) => Array.from(new Set([...prev, ...found])));
        }
      } catch { /* degradado silencioso: el snapshot conserva datos */ }
    };
    tickLogs();
    const iv = setInterval(tickLogs, 30_000);
    return () => clearInterval(iv);
  }, [account]);

  const inFlightRef = useRef(false);
  const guard = <T,>(label: string, fn: () => Promise<T>) => async (): Promise<T | undefined> => {
    if (inFlightRef.current || busy) return undefined;
    if (!account) { notify({ kind: 'warn', msg: 'Conecta tu wallet primero.' }); throw new Error('no account'); }
    if (wrongNet) { notify({ kind: 'error', msg: `Cambia a la red Codecrypto (${CHAIN.chainId}).` }); throw new Error('wrong net'); }
    inFlightRef.current = true;
    setBusy(label);
    try {
      const r = await fn();
      poll.refreshNow();
      return r;
    } catch (e) {
      notify({ kind: 'error', msg: humanizeError(e) });
      return undefined;
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  };

  const doWrap = guard('wrap', async () => {
    await upgradeToEuroX(parseEur(wrapInput));
    notify({ kind: 'ok', msg: 'EUR envuelto → EURx.' });
  });
  const doUnwrap = guard('unwrap', async () => {
    await downgradeFromEuroX(parseEur(unwrapInput));
    notify({ kind: 'ok', msg: 'EURx desenvuelto → EUR.' });
  });

  const validateReceiver = () => validateReceiverPure(receiverInput, account, CONTRACTS);

  const doCreateFlow = () => {
    const err = validateReceiver();
    if (err) { notify({ kind: 'error', msg: err }); return; }
    setShowIrrevocableModal(true); // D15: aviso antes de firmar
  };

  const confirmCreateFlow = guard('createFlow', async () => {
    setShowIrrevocableModal(false); // cerrar YA: evita doble disparo mientras se espera el tx
    await createFlow(receiverInput, RATE_WEI_PER_SEC);
    notify({ kind: 'ok', msg: 'Stream creado a 2000 EUR/mes.' });
    setReceiverInput('');
  });

  const action = <T,>(label: string, fn: (arg: string) => Promise<T>, okMsg: string) => async (arg: string) => {
    if (inFlightRef.current || busy) return;
    if (!account) { notify({ kind: 'warn', msg: 'Conecta tu wallet primero.' }); return; }
    if (wrongNet) { notify({ kind: 'error', msg: `Cambia a la red Codecrypto (${CHAIN.chainId}).` }); return; }
    inFlightRef.current = true;
    setBusy(label);
    try {
      await fn(arg);
      notify({ kind: 'ok', msg: okMsg });
      poll.refreshNow();
    } catch (e) {
      notify({ kind: 'error', msg: humanizeError(e) });
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  };
  const doPause = action('pause', pauseFlow, 'Flujo pausado (depósito retenido).');
  const doResume = action('resume', resumeFlow, 'Flujo reanudado.');
  const doClose = action('close', closeFlow, 'Flujo cerrado; depósito liberado.');
  const doClaim = action('claim', claimSettled, 'Devengo reclamado.');
  const doSettleFor = guard('settle', async () => {
    if (!account) return;
    await settle(account);
    notify({ kind: 'ok', msg: 'Insolvencia liquidada (los receptores pueden reclamar).' });
  });

  const eurBal = data?.eur ?? 0n;
  const realBal = data?.real ?? 0n;
  const info: AccountInfo | undefined = data?.info;
  const owedBal = data?.owed ?? 0n;
  const freeEurx = info ? (() => { const locked = info.depositTotal + owedBal; return realBal > locked ? realBal - locked : 0n; })() : realBal;
  const flows = useMemo(() => data?.flows ?? [], [data]);
  const ageSec = poll.lastUpdated ? Math.round((Date.now() - poll.lastUpdated) / 1000) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy={!!busy}>
      {/* RNF-12: disclaimer visible sin scroll */}
      <header className="mb-6 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900" role="note">
        <strong>Tokens de prueba sin valor ni respaldo.</strong> Red educativa privada CodeCrypto
        (chainId {CHAIN.chainId}). Prohibido su uso para pagos reales. Proyecto en <em>beta</em>.
      </header>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Superfluid EUR Streaming <span className="text-base font-normal text-gray-600">(token de prueba)</span></h1>
        {account ? (
          <span className="rounded bg-gray-800 px-3 py-1 text-sm text-white font-mono" aria-label="cuenta conectada">{account.slice(0, 10)}…{account.slice(-6)}</span>
        ) : (
          <button onClick={onConnect} className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400">
            Conectar MetaMask ({CHAIN.name})
          </button>
        )}
      </div>

      {wrongNet && (
        <p className="mb-4 rounded bg-red-100 p-2 text-red-800" role="alert">
          Estás en otra red. Cambia a Codecrypto (chainId {CHAIN.chainId}) en MetaMask para operar. Las acciones están bloqueadas.
        </p>
      )}

      {!account && (
        <p className="mb-4 text-gray-700" role="status">Modo solo lectura: conecta una wallet para envolver, crear o gestionar flujos.</p>
      )}

      {poll.error && !toast && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded bg-red-100 p-3 text-red-900">
          <span>Problema de conexión con la red RPC (último sondeo falló).</span>
          <button onClick={poll.refreshNow} className="rounded border border-red-700 px-2 py-0.5 text-xs">Reintentar ahora</button>
        </div>
      )}

      {toast && (
        <div role="alert" aria-live="assertive" className={`mb-4 rounded p-3 ${toast.kind === 'ok' ? 'bg-green-100 text-green-900' : toast.kind === 'warn' ? 'bg-yellow-100 text-yellow-900' : 'bg-red-100 text-red-900'}`}>
          {toast.msg}
        </div>
      )}

      {/* Balances en tiempo real (CU-04) */}
      <section aria-labelledby="balances" className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <h2 id="balances" className="sr-only">Balances en tiempo real</h2>
        <Stat label="EUR (ERC20)" value={formatEur(eurBal)} />
        <Stat label="EURx custodiado" value={formatEur(realBal)} />
        <Stat label="EURx desenvolvible" value={formatEur(freeEurx)} hint="saldo libre tras depósitos" />
        <Stat label="Net rate" value={info ? `${info.netFlowRate > 0n ? '+' : ''}${formatEur(info.netFlowRate)}/s` : '—'} hint={poll.degraded ? `conexión degradada · reintento ${Math.round(poll.intervalMs / 1000)} s${ageSec !== null ? ` · datos de hace ${ageSec}s` : ''}` : `refresco ${Math.round(poll.intervalMs / 1000)} s${ageSec !== null ? ` · hace ${ageSec}s` : ''}`} />
      </section>

      {info && (info.pendingDeficit > 0n || info.netOutflowGarantizado < 0n) && (
        <div role="status" className="mb-4 rounded bg-purple-50 p-3 text-sm text-purple-900">
          Cuentas con déficit impago de {formatEur(info.pendingDeficit)} EURx por liquidaciones previas
          (settled {new Date(Number(info.settledUpTo) * 1000).toLocaleString()}). Tus receptores pueden reclamar hasta cubrirlo; considera envolver más EUR o cerrar flujos.
        </div>
      )}

      {/* Wrap / unwrap (CU-01/02) */}
      {account && (
        <section aria-labelledby="wrap-h" className="mb-8 rounded-lg border p-4">
          <h2 id="wrap-h" className="mb-3 font-semibold">Envolver / Desenvolver (1:1)</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <Field id="wrap-amt" label="EUR a envolver">
              <input id="wrap-amt" inputMode="decimal" value={wrapInput} onChange={(e) => setWrapInput(e.target.value)} className="w-36 rounded border px-2 py-1" aria-label="cantidad EUR a envolver" />
            </Field>
            <button disabled={!!busy} onClick={doWrap} className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50">{busy === 'wrap' ? '…' : 'Upgrade → EURx'}</button>
            <Field id="unwrap-amt" label="EURx a desenvolver">
              <input id="unwrap-amt" inputMode="decimal" value={unwrapInput} onChange={(e) => setUnwrapInput(e.target.value)} className="w-36 rounded border px-2 py-1" aria-label="cantidad EURx a desenvolver" />
            </Field>
            <button disabled={!!busy} onClick={doUnwrap} className="rounded bg-slate-700 px-3 py-1.5 text-white disabled:opacity-50">{busy === 'unwrap' ? '…' : 'Downgrade → EUR'}</button>
          </div>
        </section>
      )}

      {/* Crear flujo (CU-03) */}
      {account && !wrongNet && (
        <section aria-labelledby="new-flow-h" className="mb-8 rounded-lg border p-4">
          <h2 id="new-flow-h" className="mb-3 font-semibold">Nuevo stream · 2000 EUR/mes (rate fijo v1)</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <Field id="receiver" label="Dirección destinataria">
              <input id="receiver" value={receiverInput} onChange={(e) => setReceiverInput(e.target.value)} placeholder="0x…" className="w-96 rounded border px-2 py-1 font-mono text-sm" aria-label="dirección Ethereum del destinatario" />
            </Field>
            <button disabled={!!busy} onClick={doCreateFlow} className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-50">Crear flujo</button>
          </div>
        </section>
      )}

      {/* Mis streams (CU-05/06) paginación 10/página (D13/RE-03b) */}
      <FlowTable busy={busy} flows={flows} onAction={(op, r) => {
        if (op === 'pause') doPause(r); else if (op === 'resume') doResume(r); else if (op === 'close') doClose(r);
      }} />

      {/* Recibidos (CU-08) */}
      {account && (
        <section aria-labelledby="recv-h" className="mb-8 rounded-lg border p-4">
          <h2 id="recv-h" className="mb-2 font-semibold">Recibidos — flujos entrantes</h2>
          {knownSenders.length === 0 ? (
            <p className="text-sm text-gray-600" role="status">Sin emisores detectados en esta sesión (v1 usa eventos de la sesión; no hay índice inverso global).</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {knownSenders.map((s, i) => (
                <li key={s} className="flex justify-between rounded bg-gray-50 px-2 py-1">
                  <span className="font-mono">{s.slice(0, 10)}…{s.slice(-6)}</span>
                  <span>{formatEur(data?.perSender?.[i] ?? 0n)} EURx exigibles</span>
                  <button disabled={!!busy || (data?.perSender?.[i] ?? 0n) === 0n} onClick={() => doClaim(s)} className="rounded bg-indigo-700 px-2 py-0.5 text-white disabled:opacity-50">Reclamar</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Keeper: settle propio si insolvencia (CU-07) */}
      {account && (
        <details className="mb-8 rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Avanzado · liquidación por insolvencia (pull)</summary>
          <p className="my-2 text-gray-700">Si tu saldo virtual se agota, cualquier cuenta puede llamar <code>settle()</code>; tus receptores reclaman después. Puedes probarlo sobre tu propia cuenta:</p>
          <button disabled={!!busy} onClick={doSettleFor} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50">settle(mí)</button>
        </details>
      )}

      {/* Modal irrevocabilidad (D15) */}
      {showIrrevocableModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="irrev-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-lg bg-white p-5">
            <h3 id="irrev-title" className="mb-2 font-bold">Confirmación de destino irreversible</h3>
            <p className="mb-4 text-sm">Vas a enviar <strong>tokens de prueba</strong> continuamente a <span className="font-mono break-all">{receiverInput}</span>. Si la dirección es incorrecta o corresponde a un contrato sin soporte, los EURx podrán quedar atrapados de forma irrecuperable en esta beta educativa.</p>
            <div className="flex justify-end gap-2">
              <button disabled={!!busy} onClick={() => setShowIrrevocableModal(false)} className="rounded border px-3 py-1.5 disabled:opacity-50">Cancelar</button>
              <button disabled={!!busy} onClick={confirmCreateFlow} className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-50">Entendido, crear flujo</button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t pt-4 text-xs text-gray-600">
        Red {CHAIN.name} · chainId {CHAIN.chainId} · EUR {CONTRACTS.EUR} · EURx {CONTRACTS.EURx} ·{' '}
        <a href="https://faucet.codecrypto.academy/" className="underline">faucet CC</a> ·{' '}
        <a href="https://gitlab.com/anlucorporations/superfluid" className="underline">código MIT</a>
      </footer>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums" aria-label={`${label}: ${value}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function FlowTable({ busy, flows, onAction }: {
  busy: string | null;
  flows: { receiver: string; flowRate: bigint; status: number; accumulatedBalance: bigint; virtualDevengo: bigint }[];
  onAction: (op: 'pause' | 'resume' | 'close', receiver: string) => void;
}) {
  const [page, setPage] = useState(0);
  // RE-03b: 10 filas DOM + control de paginación (slicing puro en ui-logic.paginate)
  const pg = paginate(flows, page, PAGE_SIZE);
  const pages = pg.pageCount;
  const slice = pg.slice;

  return (
    <section aria-labelledby="flows-h" className="mb-8">
      <h2 id="flows-h" className="mb-2 font-semibold">Mis streams salientes ({flows.length})</h2>
      {flows.length === 0 ? (
        <p className="text-sm text-gray-600" role="status">Sin flujos activos.</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th scope="col" className="p-2">Destino</th>
                <th scope="col" className="p-2">Rate (EURx/s)</th>
                <th scope="col" className="p-2">Estado</th>
                <th scope="col" className="p-2">Acumulado</th>
                <th scope="col" className="p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((f) => (
                <tr key={f.receiver} className="border-b">
                  <td className="p-2 font-mono">{f.receiver.slice(0, 10)}…{f.receiver.slice(-6)}</td>
                  <td className="p-2 tabular-nums">{formatEur(f.flowRate)}</td>
                  <td className="p-2">
                    <span className={f.status === 1 ? 'text-green-800' : f.status === 2 ? 'text-yellow-800' : 'text-gray-700'}>
                      {f.status === 1 ? 'Activo' : f.status === 2 ? 'Pausado (retiene depósito)' : 'Cerrado'}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums" aria-label={`devengo virtual ${formatEur(f.virtualDevengo)} EURx`}>{formatEur(f.virtualDevengo)}</td>
                  <td className="space-x-1 p-2">
                    {f.status === 1 && <button disabled={!!busy} onClick={() => onAction('pause', f.receiver)} className="rounded bg-amber-800 px-2 py-0.5 text-white disabled:opacity-50">Pausar</button>}
                    {f.status === 2 && <button disabled={!!busy} onClick={() => onAction('resume', f.receiver)} className="rounded bg-green-700 px-2 py-0.5 text-white disabled:opacity-50">Reanudar</button>}
                    {(f.status === 1 || f.status === 2) && <button disabled={!!busy} onClick={() => onAction('close', f.receiver)} className="rounded bg-red-700 px-2 py-0.5 text-white disabled:opacity-50">Cerrar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <nav aria-label="paginación de streams" className="mt-2 flex items-center gap-2 text-sm">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">← Anterior</button>
              <span>página {page + 1}/{pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">Siguiente →</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
