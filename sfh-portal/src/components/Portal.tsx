'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { brltxAbi, erc20Abi } from '@/lib/abi';
import { publicClient, besu } from '@/lib/chain';
import {
  connectWallet,
  currentAccounts,
  currentChainId,
  ensureChain,
  sendTx,
  signBindingMessage,
} from '@/lib/wallet';
import {
  createPortalSession,
  createWalletBinding,
  generateVoucher,
  getSession,
  pauseSession,
  redeemVoucher,
  requestAuthorize,
  resumeSession,
  type PortalSessionResponse,
  type SessionView,
} from '@/lib/api';
import {
  MIN_OPENING_SECONDS,
  buildSiweMessage,
  formatDuration,
  formatToken,
  minOpeningBalanceWei,
  parseToken,
  portalChecklist,
  remainingSeconds,
  validateStream,
} from '@/lib/portal-logic';

type Address = `0x${string}`;

const BRLT = (process.env.NEXT_PUBLIC_BRLT_ADDRESS ?? '') as Address | '';
const BRLTX = (process.env.NEXT_PUBLIC_BRLTX_ADDRESS ?? '') as Address | '';
const PAYOUT = (process.env.NEXT_PUBLIC_PAYOUT_WALLET ?? '') as Address | '';
const TARIFF_WEI = BigInt(process.env.NEXT_PUBLIC_PRICE_PER_SECOND_WEI ?? '500000000000000');
const BANDWIDTH_DOWN = Number(process.env.NEXT_PUBLIC_BANDWIDTH_DOWN_BPS ?? '50000000');
const BANDWIDTH_UP = Number(process.env.NEXT_PUBLIC_BANDWIDTH_UP_BPS ?? '10000000');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Portal() {
  const params = useSearchParams();
  const bindFromUrl = params.get('bind_token') ?? '';
  const [manualToken, setManualToken] = useState('');
  const bindToken = bindFromUrl || manualToken;

  const [address, setAddress] = useState<Address | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [portalSession, setPortalSession] = useState<PortalSessionResponse | null>(null);
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [networkSessionId, setNetworkSessionId] = useState<string | null>(null);
  const [sessionView, setSessionView] = useState<SessionView | null>(null);
  const [rateInput, setRateInput] = useState(formatToken(TARIFF_WEI, 18, 8));
  const [wrapInput, setWrapInput] = useState('10');
  const [voucherCode, setVoucherCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [balanceWei, setBalanceWei] = useState(0n);
  const [allowanceWei, setAllowanceWei] = useState(0n);
  const [wrappedWei, setWrappedWei] = useState(0n);
  const [message, setMessage] = useState('Conecta tu wallet o introduce el token del hotspot.');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const rateWei = useMemo(() => parseToken(rateInput), [rateInput]);
  const wrapAmount = useMemo(() => parseToken(wrapInput), [wrapInput]);

  const refreshBalances = useCallback(async () => {
    if (!address || !BRLT || !BRLTX) return;
    try {
      const [bal, allow, wrapped] = await Promise.all([
        publicClient.readContract({
          address: BRLT,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: BRLT,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, BRLTX],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: BRLTX,
          abi: brltxAbi,
          functionName: 'realBalanceOf',
          args: [address],
        }) as Promise<bigint>,
      ]);
      setBalanceWei(bal);
      setAllowanceWei(allow);
      setWrappedWei(wrapped);
    } catch {
      /* RPC puntual: se reintenta en el siguiente ciclo */
    }
  }, [address]);

  useEffect(() => {
    void (async () => {
      const accounts = await currentAccounts();
      if (accounts[0]) setAddress(accounts[0]);
      setChainId(await currentChainId());
    })();
  }, []);

  useEffect(() => {
    if (!address) return;
    void refreshBalances();
    const t = setInterval(() => void refreshBalances(), 10_000);
    return () => clearInterval(t);
  }, [address, refreshBalances]);

  useEffect(() => {
    if (!networkSessionId) return;
    const fetchSession = async () => {
      try {
        setSessionView(await getSession(networkSessionId));
      } catch {
        /* aún no existe */
      }
    };
    void fetchSession();
    const t = setInterval(() => void fetchSession(), 5000);
    return () => clearInterval(t);
  }, [networkSessionId]);

  const checklist = portalChecklist({
    hasBindToken: Boolean(bindToken),
    noticeAccepted,
    sessionId: portalSession?.session_id ?? null,
    walletConnected: Boolean(address),
    bindingId,
    wrappedBalanceWei: wrappedWei,
  });

  const streamCheck = validateStream({
    rateWei,
    tariffWei: TARIFF_WEI,
    balanceWei: wrappedWei,
    receiver: PAYOUT || '',
    payoutWallet: PAYOUT || '',
  });

  const wrongChain = Boolean(address && chainId && chainId !== besu.id);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    await run(async () => {
      const acc = await connectWallet();
      await ensureChain();
      setAddress(acc);
      setChainId(await currentChainId());
      setMessage('Wallet conectada. Acepta el aviso de privacidad si aún no lo hiciste.');
    });
  }

  async function handleNotice() {
    await run(async () => {
      if (!bindToken) throw new Error('falta el bind_token del hotspot');
      const s = await createPortalSession(bindToken, 'v1');
      setPortalSession(s);
      setNoticeAccepted(true);
      setMessage('Sesión de portal creada. Firma la vinculación de wallet.');
    });
  }

  async function handleSign() {
    await run(async () => {
      if (!address || !portalSession) throw new Error('conecta la wallet y acepta el aviso');
      const msg = buildSiweMessage({
        domain: 'sfhostpot.local',
        sessionId: portalSession.session_id,
        wallet: address,
        issuedAt: new Date().toISOString(),
      });
      const signature = await signBindingMessage(address, msg);
      const b = await createWalletBinding({
        sessionId: portalSession.session_id,
        wallet: address,
        message: msg,
        signature,
      });
      setBindingId(b.binding_id);
      setMessage('Wallet vinculada. Envuelve BRLT para abrir el stream.');
    });
  }

  async function handleWrap() {
    await run(async () => {
      if (!address || !BRLT || !BRLTX) throw new Error('faltan direcciones de contrato');
      if (wrapAmount <= 0n) throw new Error('importe inválido');
      await ensureChain();
      if (allowanceWei < wrapAmount) {
        setMessage('Aprobando BRLT…');
        const h = await sendTx(address, {
          address: BRLT,
          abi: erc20Abi,
          functionName: 'approve',
          args: [BRLTX, wrapAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      setMessage('Envolviendo BRLT → BRLTx…');
      const h2 = await sendTx(address, {
        address: BRLTX,
        abi: brltxAbi,
        functionName: 'upgradeTo',
        args: [wrapAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: h2 });
      await refreshBalances();
      setMessage('BRLTx disponible. Ya puedes abrir el stream.');
    });
  }

  async function handleOpenStream() {
    await run(async () => {
      if (!address || !BRLTX || !PAYOUT) throw new Error('faltan direcciones de contrato');
      if (!portalSession || !bindingId) throw new Error('completa el aviso y la firma');
      if (!streamCheck.ok) throw new Error(`stream inválido: ${streamCheck.reason}`);
      await ensureChain();
      setMessage('Abriendo flujo continuo…');
      const h = await sendTx(address, {
        address: BRLTX,
        abi: brltxAbi,
        functionName: 'createFlow',
        args: [PAYOUT, rateWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      setMessage('Flujo creado. Solicitando acceso provisional…');
      const s = await requestAuthorize({
        portalSessionId: portalSession.session_id,
        bindingId,
        txHash: h,
        flowRateWei: rateWei.toString(),
      });
      setNetworkSessionId(s.session_id);
      setMessage('Acceso provisional solicitado (60 s).');
    });
  }

  async function handlePauseResume(action: 'pause' | 'resume') {
    await run(async () => {
      if (!networkSessionId) throw new Error('sin sesión de red');
      if (action === 'pause') await pauseSession(networkSessionId);
      else await resumeSession(networkSessionId);
      setSessionView(await getSession(networkSessionId));
      setMessage(action === 'pause' ? 'Sesión revocada (stream pausado).' : 'Reautorización solicitada.');
    });
  }

  async function handleGenerateVoucher() {
    await run(async () => {
      if (!networkSessionId) throw new Error('abre primero tu stream');
      const v = await generateVoucher(networkSessionId, { maxChildren: 2, bandwidthPercent: 50 });
      setGeneratedCode(v.code);
      setMessage('Voucher generado: se muestra una sola vez.');
    });
  }

  async function handleRedeemVoucher() {
    await run(async () => {
      if (!voucherCode) throw new Error('introduce el código');
      if (!portalSession || !bindingId) throw new Error('completa aviso y firma');
      const s = await redeemVoucher({
        code: voucherCode,
        portalSessionId: portalSession.session_id,
        bindingId,
        mac: '02:00:00:00:00:99',
        ip: '10.0.0.99',
      });
      setMessage(`Equipo hijo autorizado (${s.status}).`);
    });
  }

  const remaining = remainingSeconds(sessionView?.provisional_until ?? null);

  return (
    <div className="flex flex-col gap-5">
      <div aria-live="polite" className="min-h-6 text-sm">
        {error ? <p className="text-rose-400">Error: {error}</p> : <p className="text-slate-400">{message}</p>}
      </div>

      <Section title="1 · Token del hotspot">
        {bindFromUrl ? (
          <p className="text-sm text-brand-500">Token recibido del hotspot.</p>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            bind_token
            <input
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="pega el bind_token del portal cautivo"
            />
          </label>
        )}
      </Section>

      <Section title="2 · Aviso de privacidad">
        <p className="text-sm text-slate-400">
          Tratamos tu MAC, IP y wallet para prestar el servicio, con retención de 30 días. La wallet
          on-chain es pública e inmutable.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={noticeAccepted}
            disabled={!bindToken || Boolean(portalSession)}
            onChange={(e) => setNoticeAccepted(e.target.checked)}
          />
          He leído y acepto el aviso de privacidad
        </label>
        <button
          className="w-fit rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          disabled={!bindToken || !noticeAccepted || Boolean(portalSession) || busy}
          onClick={handleNotice}
        >
          Aceptar y crear sesión
        </button>
        {portalSession && <p className="text-xs text-slate-500">session_id: {portalSession.session_id}</p>}
      </Section>

      <Section title="3 · Wallet">
        {!address ? (
          <button
            className="w-fit rounded-md bg-brand-600 px-4 py-2 text-sm disabled:opacity-40"
            disabled={busy}
            onClick={handleConnect}
          >
            Conectar wallet
          </button>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-mono text-xs text-slate-400">
              {address} {wrongChain ? '· RED INCORRECTA' : ''}
            </p>
            <button
              className="w-fit rounded-md bg-brand-600 px-4 py-2 text-sm disabled:opacity-40"
              disabled={!checklist.canSign || Boolean(bindingId) || busy}
              onClick={handleSign}
            >
              Firmar vinculación (SIWE)
            </button>
            {wrongChain && (
              <button
                className="w-fit rounded-md border border-amber-600 px-4 py-2 text-sm text-amber-300"
                onClick={() => void ensureChain().then(() => setChainId(besu.id))}
              >
                Cambiar a la red {besu.name}
              </button>
            )}
          </div>
        )}
        {bindingId && <p className="text-xs text-slate-500">binding: {bindingId}</p>}
      </Section>

      <Section title="4 · Envolver BRLT → BRLTx (1:1)">
        <p className="text-sm text-slate-400">
          BRLT: {formatToken(balanceWei)} · BRLTx: {formatToken(wrappedWei)} · allowance:{' '}
          {formatToken(allowanceWei)}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Cantidad BRLT
            <input
              className="w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={wrapInput}
              onChange={(e) => setWrapInput(e.target.value)}
            />
          </label>
          <button
            className="rounded-md bg-brand-600 px-4 py-2 text-sm disabled:opacity-40"
            disabled={!checklist.canWrap || busy}
            onClick={handleWrap}
          >
            Aprobar y envolver
          </button>
        </div>
      </Section>

      <Section title="5 · Abrir stream">
        <p className="text-sm text-slate-400">
          Tarifa mínima: {formatToken(TARIFF_WEI, 18, 8)} BRLTx/s · garantía de apertura:{' '}
          {formatToken(minOpeningBalanceWei(rateWei || TARIFF_WEI))} BRLTx (1 h) · plan {BANDWIDTH_DOWN / 1e6}
          /{BANDWIDTH_UP / 1e6} Mbps
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            rate (BRLTx/s)
            <input
              className="w-52 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
          </label>
          <button
            className="rounded-md bg-brand-600 px-4 py-2 text-sm disabled:opacity-40"
            disabled={!checklist.canStream || !streamCheck.ok || busy}
            onClick={handleOpenStream}
          >
            Abrir flujo y solicitar acceso
          </button>
        </div>
        {!streamCheck.ok && <p className="text-xs text-amber-400">Comprobación: {streamCheck.reason}</p>}
        <p className="text-xs text-slate-500">Mínimo {MIN_OPENING_SECONDS} s de garantía al abrir (D54).</p>
      </Section>

      <Section title="6 · Sesión de red">
        {!sessionView ? (
          <p className="text-sm text-slate-500">Aún no hay sesión de red autorizada.</p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              estado: <strong>{sessionView.status}</strong> · rate: {formatToken(BigInt(sessionView.rate), 18, 8)}
              /s
            </p>
            {remaining !== null && <p>ventana provisional: {formatDuration(remaining)}</p>}
            {sessionView.disconnect_reason && (
              <p className="text-amber-400">motivo: {sessionView.disconnect_reason}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md border border-slate-700 px-4 py-2 disabled:opacity-40"
                disabled={busy}
                onClick={() => handlePauseResume('pause')}
              >
                Pausar (revoca)
              </button>
              <button
                className="rounded-md border border-slate-700 px-4 py-2 disabled:opacity-40"
                disabled={busy}
                onClick={() => handlePauseResume('resume')}
              >
                Reanudar
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="7 · Vouchers para equipos hijos">
        <p className="text-sm text-slate-400">
          Genera un código para hasta 2 equipos sin wallet, al 50 % de tu velocidad mientras dure tu
          stream.
        </p>
        <button
          className="w-fit rounded-md bg-brand-600 px-4 py-2 text-sm disabled:opacity-40"
          disabled={!networkSessionId || busy}
          onClick={handleGenerateVoucher}
        >
          Generar voucher
        </button>
        {generatedCode && (
          <p className="rounded-md border border-brand-700 bg-brand-700/20 p-3 font-mono text-lg">
            {generatedCode}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Canjear código (equipo hijo)
            <input
              className="w-52 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
            />
          </label>
          <button
            className="rounded-md border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
            disabled={busy}
            onClick={handleRedeemVoucher}
          >
            Canjear
          </button>
        </div>
      </Section>
    </div>
  );
}
