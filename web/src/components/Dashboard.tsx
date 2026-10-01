'use client';
// Dashboard principal — CU-01..CU-09, CU-12, CU-13 · Design System v1.1 (@visualUiUx).
// Todos los colores/tamaños salen de tokens (--sf-* → utilidades Tailwind v4).
// ⚠️ Anclas de E2E (roles, aria-labels, textos exactos): NO renombrar sin actualizar specs.
// WCAG: todos los pares verificados con axe (claro Y oscuro).

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
import ThemeToggle from '@/components/ThemeToggle';

type Toast = { kind: 'ok' | 'error' | 'warn'; msg: string };

/* ----------------------------- átomos de UI ------------------------------ */

function BtnPrimary({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-on-brand shadow-card transition-colors duration-150 hover:bg-primary-hover active:bg-brand-active disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function BtnSecondary({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-raised px-4 font-medium text-ink transition-colors duration-150 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function BtnDanger({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-9 items-center justify-center rounded-md bg-err px-3 text-sm font-medium text-on-err transition-colors duration-150 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function Card({ id, title, children, action }: { id?: string; title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-6 rounded-card border border-line bg-surface p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-h3 text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-11 w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-ink placeholder:text-ink-disabled transition-colors duration-150 focus:border-brand ${props.className ?? ''}`}
    />
  );
}

/* ------------------------------ organismo ------------------------------ */

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
  const flowing = !!info && info.netFlowRate !== 0n;

  return (
    <div className="min-h-dvh">
      {/* barra superior fija con marca (glass) */}
      <div className="sticky top-0 z-40 border-b border-divider bg-[var(--sf-glass)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* logo: tres gotas de flujo, decorativo */}
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-pill bg-gradient-to-br from-[var(--sf-brand)] to-[#0d9488] text-on-brand">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 8c4-3 6 3 10 0M4 14c4-3 6 3 10 0M4 20c4-3 6 3 10 0" transform="translate(3 -6)" />
              </svg>
            </span>
            <p className="text-body-lg font-semibold tracking-tight">Superfluid <span className="text-brand">EUR</span>
              <span className="ml-2 rounded-pill bg-brand-subtle px-2 py-0.5 text-caption font-medium text-brand-subtle-ink">BETA educativa</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {account ? (
              <span className="rounded-pill border border-line bg-sunken px-3 py-1.5 text-body-sm font-medium text-ink-2 tnum" aria-label="cuenta conectada">
                {account.slice(0, 10)}…{account.slice(-6)}
              </span>
            ) : (
              <BtnPrimary onClick={onConnect}>Conectar MetaMask ({CHAIN.name})</BtnPrimary>
            )}
          </div>
        </div>
      </div>

      <main aria-busy={!!busy} className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {/* RNF-12: disclaimer visible sin scroll */}
        <header role="note" className="mb-6 flex items-start gap-3 rounded-card border border-info/40 bg-info-bg p-4 text-body-sm text-info">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" />
          </svg>
          <p>
            <strong>Tokens de prueba sin valor ni respaldo.</strong> Red educativa privada CodeCrypto
            (chainId {CHAIN.chainId}). Prohibido su uso para pagos reales. Proyecto en <em>beta</em>.
          </p>
        </header>

        <h1 className="sr-only">Superfluid EUR Streaming (token de prueba)</h1>

        {wrongNet && (
          <p role="alert" className="mb-4 rounded-card border border-err/40 bg-err-bg p-4 text-body-sm text-err-ink">
            Estás en otra red. Cambia a Codecrypto (chainId {CHAIN.chainId}) en MetaMask para operar. Las acciones están bloqueadas.
          </p>
        )}

        {!account && (
          <p role="status" className="mb-4 rounded-card bg-sunken p-3 text-body-sm text-ink-2">
            Modo solo lectura: conecta una wallet para envolver, crear o gestionar flujos.
          </p>
        )}

        {poll.error && !toast && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-err/40 bg-err-bg p-4 text-body-sm text-err-ink">
            <span>Problema de conexión con la red RPC (último sondeo falló).</span>
            <BtnSecondary onClick={poll.refreshNow} className="min-h-9 border-err/50 px-3 text-sm text-err-ink">Reintentar ahora</BtnSecondary>
          </div>
        )}

        {toast && (
          <div
            role="alert"
            aria-live="assertive"
            className={`fixed bottom-5 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 rounded-card border p-4 text-body-sm shadow-toast ${
              toast.kind === 'ok' ? 'border-ok/40 bg-ok-bg text-ok' : toast.kind === 'warn' ? 'border-warn/40 bg-warn-bg text-warn' : 'border-err/40 bg-err-bg text-err-ink'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Balances en tiempo real (CU-04) */}
        <section aria-labelledby="balances" className="mb-8">
          <h2 id="balances" className="mb-3 flex items-center gap-2 text-h2">
            Balances
            {flowing && <span aria-hidden="true" className="sf-flow-dot" />}
            {flowing && <span className="text-caption font-medium text-ok">fluyendo</span>}
          </h2>
          {account && !data ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="status" aria-label="Cargando balances">
              {[0, 1, 2, 3].map((i) => <div key={i} className="sf-skeleton h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="EUR (ERC20)" value={formatEur(eurBal)} />
              <Stat label="EURx custodiado" value={formatEur(realBal)} />
              <Stat label="EURx desenvolvible" value={formatEur(freeEurx)} hint="saldo libre tras depósitos" />
              <Stat
                label="Net rate"
                value={info ? `${info.netFlowRate > 0n ? '+' : ''}${formatEur(info.netFlowRate)}/s` : '—'}
                tone={info ? (info.netFlowRate < 0n ? 'err' : info.netFlowRate > 0n ? 'ok' : 'neutral') : 'neutral'}
                hint={poll.degraded
                  ? `conexión degradada · reintento ${Math.round(poll.intervalMs / 1000)} s${ageSec !== null ? ` · datos de hace ${ageSec}s` : ''}`
                  : `refresco ${Math.round(poll.intervalMs / 1000)} s${ageSec !== null ? ` · hace ${ageSec}s` : ''}`}
              />
            </div>
          )}
        </section>

        {info && (info.pendingDeficit > 0n || info.netOutflowGarantizado < 0n) && (
          <div role="status" className="mb-6 rounded-card border border-warn/40 bg-warn-bg p-4 text-body-sm text-warn">
            Cuentas con déficit impago de {formatEur(info.pendingDeficit)} EURx por liquidaciones previas
            (settled {new Date(Number(info.settledUpTo) * 1000).toLocaleString()}). Tus receptores pueden reclamar hasta cubrirlo; considera envolver más EUR o cerrar flujos.
          </div>
        )}

        {/* Envolver / desenvolver (CU-01/02) */}
        {account && (
          <Card id="wrap-h" title="Envolver / Desenvolver (1:1)">
            <div className="flex flex-wrap items-end gap-3">
              <Field id="wrap-amt" label="EUR a envolver">
                <Input id="wrap-amt" inputMode="decimal" value={wrapInput} onChange={(e) => setWrapInput(e.target.value)} className="w-40" aria-label="cantidad EUR a envolver" />
              </Field>
              <BtnPrimary disabled={!!busy} onClick={doWrap}>{busy === 'wrap' ? '…' : 'Upgrade → EURx'}</BtnPrimary>
              <Field id="unwrap-amt" label="EURx a desenvolver">
                <Input id="unwrap-amt" inputMode="decimal" value={unwrapInput} onChange={(e) => setUnwrapInput(e.target.value)} className="w-40" aria-label="cantidad EURx a desenvolver" />
              </Field>
              <BtnSecondary disabled={!!busy || wrongNet} onClick={doUnwrap}>{busy === 'unwrap' ? '…' : 'Downgrade → EUR'}</BtnSecondary>
            </div>
          </Card>
        )}

        {/* Nuevo stream (CU-03) */}
        {account && !wrongNet && (
          <Card id="new-flow-h" title={<>Nuevo stream <span className="text-body-sm font-normal text-ink-2">· 2000 EUR/mes (rate fijo v1)</span></>}>
            <div className="flex flex-wrap items-end gap-3">
              <Field id="receiver" label="Dirección destinataria" className="grow">
                <Input
                  id="receiver" value={receiverInput} onChange={(e) => setReceiverInput(e.target.value)} placeholder="0x…"
                  className="max-w-lg font-mono text-body-sm" aria-label="dirección Ethereum del destinatario"
                />
              </Field>
              <BtnPrimary disabled={!!busy} onClick={doCreateFlow}>Crear flujo</BtnPrimary>
            </div>
          </Card>
        )}

        {/* Mis streams (CU-05/06) paginación 10/página (D13/RE-03b) */}
        <FlowTable busy={busy} flows={flows} onAction={(op, r) => {
          if (op === 'pause') doPause(r); else if (op === 'resume') doResume(r); else if (op === 'close') doClose(r);
        }} />

        {/* Recibidos (CU-08) */}
        {account && (
          <Card id="recv-h" title="Recibidos — flujos entrantes">
            {knownSenders.length === 0 ? (
              <EmptyState>
                Sin emisores detectados en esta sesión (v1 usa eventos de la sesión; no hay índice inverso global).
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {knownSenders.map((s, i) => (
                  <li key={s} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-4 py-3 text-body-sm">
                    <span className="font-mono text-ink-2">{s.slice(0, 10)}…{s.slice(-6)}</span>
                    <span className="tnum text-ink">{formatEur(data?.perSender?.[i] ?? 0n)} EURx exigibles</span>
                    <BtnSecondary disabled={!!busy || (data?.perSender?.[i] ?? 0n) === 0n} onClick={() => doClaim(s)} className="min-h-9 px-3 text-sm">
                      Reclamar
                    </BtnSecondary>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Keeper: settle propio si insolvencia (CU-07) */}
        {account && (
          <details className="mb-6 rounded-card border border-line bg-surface p-4 text-body-sm">
            <summary className="cursor-pointer select-none font-medium text-ink-2">Avanzado · liquidación por insolvencia (pull)</summary>
            <p className="my-3 text-ink-2">
              Si tu saldo virtual se agota, cualquier cuenta puede llamar <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-caption">settle()</code>;
              tus receptores reclaman después. Puedes probarlo sobre tu propia cuenta:
            </p>
            <BtnDanger disabled={!!busy} onClick={doSettleFor}>settle(mí)</BtnDanger>
          </details>
        )}

        {/* Modal irrevocabilidad (D15) */}
        {showIrrevocableModal && (
          <div role="dialog" aria-modal="true" aria-labelledby="irrev-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-pop">
              <h3 id="irrev-title" className="mb-2 text-h3">Confirmación de destino irreversible</h3>
              <p className="mb-5 text-body-sm text-ink-2">
                Vas a enviar <strong className="text-ink">tokens de prueba</strong> continuamente a{' '}
                <span className="break-all font-mono text-caption text-ink">{receiverInput}</span>. Si la dirección es
                incorrecta o corresponde a un contrato sin soporte, los EURx podrán quedar atrapados de forma
                irrecuperable en esta beta educativa.
              </p>
              <div className="flex justify-end gap-2">
                <BtnSecondary disabled={!!busy} onClick={() => setShowIrrevocableModal(false)}>Cancelar</BtnSecondary>
                <BtnPrimary disabled={!!busy} onClick={confirmCreateFlow}>Entendido, crear flujo</BtnPrimary>
              </div>
            </div>
          </div>
        )}

        <footer className="border-t border-divider pt-5 text-caption text-ink-3">
          Red {CHAIN.name} · chainId {CHAIN.chainId} · EUR <span className="font-mono">{CONTRACTS.EUR.slice(0, 10)}…{CONTRACTS.EUR.slice(-6)}</span> · EURx <span className="font-mono">{CONTRACTS.EURx.slice(0, 10)}…{CONTRACTS.EURx.slice(-6)}</span> ·{' '}
          <a href="https://faucet.codecrypto.academy/" className="font-medium text-brand underline-offset-2 hover:underline">faucet CC</a>{' · '}
          <a href="https://gitlab.com/anlucorporations/superfluid" className="font-medium text-brand underline-offset-2 hover:underline">código MIT</a>
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------ moléculas ------------------------------ */

function Stat({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'ok' | 'err' }) {
  return (
    <div className="rounded-card border border-line bg-raised p-4 shadow-card">
      <p className="text-caption font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p
        className={`mt-1 text-body-lg font-semibold tnum ${tone === 'ok' ? 'text-ok' : tone === 'err' ? 'text-err' : 'text-ink'}`}
        aria-label={`${label}: ${value}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-caption text-ink-3">{hint}</p>}
    </div>
  );
}

function Field({ id, label, children, className = '' }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-caption font-medium text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-dashed border-line-strong bg-sunken px-4 py-6 text-center text-body-sm text-ink-2">
      {children}
    </p>
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
    <Card
      id="flows-h"
      title={`Mis streams salientes (${flows.length})`}
    >
      {flows.length === 0 ? (
        <EmptyState>
          Sin flujos activos. Crea tu primer stream arriba: se enviarán 2000 EUR de prueba al mes, gota a gota.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-divider">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="bg-sunken text-left">
                  <th scope="col" className="p-3 font-medium text-ink-2">Destino</th>
                  <th scope="col" className="p-3 font-medium text-ink-2">Rate (EURx/s)</th>
                  <th scope="col" className="p-3 font-medium text-ink-2">Estado</th>
                  <th scope="col" className="p-3 font-medium text-ink-2">Acumulado</th>
                  <th scope="col" className="p-3 font-medium text-ink-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((f) => (
                  <tr key={f.receiver} className="border-t border-divider">
                    <td className="p-3 font-mono text-ink">{f.receiver.slice(0, 10)}…{f.receiver.slice(-6)}</td>
                    <td className="p-3 tnum text-ink-2">{formatEur(f.flowRate)}</td>
                    <td className="p-3">
                      <StatusPill status={f.status} />
                    </td>
                    <td className="p-3 tnum text-ink" aria-label={`devengo virtual ${formatEur(f.virtualDevengo)} EURx`}>{formatEur(f.virtualDevengo)}</td>
                    <td className="space-x-1.5 p-3">
                      {f.status === 1 && <BtnSecondary disabled={!!busy} onClick={() => onAction('pause', f.receiver)} className="min-h-9 px-3 text-sm">Pausar</BtnSecondary>}
                      {f.status === 2 && <BtnPrimary disabled={!!busy} onClick={() => onAction('resume', f.receiver)} className="min-h-9 px-3 text-sm">Reanudar</BtnPrimary>}
                      {(f.status === 1 || f.status === 2) && <BtnDanger disabled={!!busy} onClick={() => onAction('close', f.receiver)}>Cerrar</BtnDanger>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="paginación de streams" className="mt-4 flex items-center gap-3 text-body-sm text-ink-2">
              <BtnSecondary disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="min-h-9 px-3 text-sm">← Anterior</BtnSecondary>
              <span className="tnum">página {pg.page + 1}/{pages}</span>
              <span className="text-ink-3 tnum">· mostrando {pg.from}–{pg.to} de {flows.length}</span>
              <BtnSecondary disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="min-h-9 px-3 text-sm">Siguiente →</BtnSecondary>
            </nav>
          )}
        </>
      )}
    </Card>
  );
}

/** Badge de estado del flujo (semántica inalterada: mismos textos para E2E). */
function StatusPill({ status }: { status: number }) {
  if (status === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-ok-bg px-2.5 py-1 text-caption font-medium text-ok">
        <span aria-hidden="true" className="sf-flow-dot !h-2 !w-2" />Activo
      </span>
    );
  }
  if (status === 2) {
    return <span className="inline-flex items-center gap-1.5 rounded-pill bg-warn-bg px-2.5 py-1 text-caption font-medium text-warn">Pausado (retiene depósito)</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-pill bg-sunken px-2.5 py-1 text-caption font-medium text-ink-3">Cerrado</span>;
}
