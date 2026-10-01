// Fase 4 (pruebas): lógica pura extraída de la UI para teste unitario sin React/DOM.
// Comportamiento idéntico al original (web/src/config/web3.ts, Dashboard.tsx,
// web/src/lib/superfluid.ts); los módulos de origen reexportan estas funciones.

export const DECIMALS = 18;
export const PAGE_SIZE = 10; // RE-03b: 10 filas DOM + control de paginación
export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** Formato truncado a 6 decimales con signo (ex-original de config/web3.ts). */
export function formatEur(wei: bigint, decimals: number = DECIMALS): string {
  const neg = wei < 0n;
  const s = (neg ? -wei : wei).toString().padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  const out = frac ? `${int}.${frac}` : int;
  return neg ? `-${out}` : out;
}

/**
 * "5" | "1.25" → wei (18 dec). Trunca más allá de 18 decimales.
 * Lanza Error con mensaje UI (D7) si el formato es inválido o la cantidad es 0.
 */
export function parseEur(v: string): bigint {
  const t = v.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('cantidad inválida');
  const [i, f = ''] = t.split('.');
  const frac = (f + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  const wei = BigInt(i) * 10n ** BigInt(DECIMALS) + BigInt(frac || '0');
  if (wei === 0n) throw new Error('cantidad debe ser mayor que 0');
  return wei;
}

export interface ReceiverContracts { EUR: string; EURx: string }

/**
 * Validación del destino antes de abrir el modal irrevocable (D15).
 * @returns mensaje de error UI o null si es válido.
 */
export function validateReceiver(input: string, account: string | null, contracts: ReceiverContracts): string | null {
  const addr = input ?? '';
  if (!ADDR_RE.test(addr)) return 'Dirección Ethereum inválida.';
  if (addr.toLowerCase() === account?.toLowerCase()) return 'El destino no puede ser tu propia cuenta.';
  if (addr.toLowerCase() === contracts.EURx.toLowerCase() || addr.toLowerCase() === contracts.EUR.toLowerCase()) {
    return 'El destino no puede ser un contrato del sistema.';
  }
  return null;
}

/** Traducción de errores de contrato/wallet a mensajes UI (D7). Ex-original superfluid.ts. */
export function humanizeError(err: unknown): string {
  if (typeof err === 'string') {
    err = { message: err };
  }
  const e = err as { reason?: string; code?: number; message?: string; error?: { message?: string } };
  const reason: string = e?.reason ?? e?.error?.message ?? e?.message ?? '';
  const map: Record<string, string> = {
    'EUR: insufficient balance': 'No tienes EUR suficientes para envolver.',
    'EuroX: locked by deposits': 'Parte de tus EURx están bloqueados como depósito de tus streams activos/pausados.',
    'EuroX: reserve undercollateralized': 'La reserva del emisor está garantizando otros flujos; espera a que se cierren o liquida con settle().',
    'NETWORK_MISMATCH': 'Tu wallet está en otra red; cámbiala a Codecrypto (81234).',
    'EuroX: nothing to claim': 'No hay devengo pendiente por reclamar.',
    'EuroX: zero amount': 'La cantidad debe ser mayor que 0.',
    'EuroX: rate must be positive': 'La tasa del flujo debe ser positiva.',
    'EuroX: insufficient free balance': 'Saldo libre insuficiente: necesitas más EURx para el depósito y buffer del flujo.',
    'EuroX: flow exists': 'Ya existe un flujo hacia esa dirección.',
    'EuroX: self flow': 'El destino no puede ser tu propia cuenta.',
    'EuroX: invalid destination': 'Destino inválido (contrato del token o cero).',
    'EuroX: not insolvent': 'La cuenta aún es solvente; no se puede liquidar.',
    'EuroX: nothing to settle': 'No hay flujos abiertos que liquidar.',
    'EuroX: only sender': 'Solo el emisor del flujo puede gestionarlo.',
    'EuroX: already paused or missing': 'El flujo ya está pausado o no existe.',
    'EuroX: not paused': 'El flujo no está pausado.',
    NO_WALLET: 'Conecta MetaMask para ejecutar esta acción (modo solo lectura activo).',
  };
  for (const k of Object.keys(map)) if (reason.includes(k)) return map[k];
  if (e?.code === 4001 || reason.includes('user rejected') || reason.includes('User rejected')) return 'Firma cancelada.';
  return reason || 'Error desconocido';
}

/** Slicing de paginación (RE-03b): nunca lanza si page está fuera de rango. */
export interface Pagination<T> {
  page: number;      // índice efectivo tras recorte
  pageCount: number; // >= 1
  slice: T[];
  hasPrev: boolean;
  hasNext: boolean;
  from: number;      // 1-based del primer ítem visible (0 si vacío)
  to: number;
}

export function paginate<T>(items: readonly T[], pageIndex: number, pageSize: number = PAGE_SIZE): Pagination<T> {
  const size = pageSize > 0 ? pageSize : PAGE_SIZE;
  const n = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(0, Math.trunc(pageIndex) || 0), pageCount - 1);
  const start = page * size;
  const slice = items.slice(start, start + size);
  return {
    page, pageCount, slice,
    hasPrev: page > 0,
    hasNext: page < pageCount - 1,
    from: n === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

// ---------------------------------------------------------------- poller (RE-04)
export const POLL_BASE_MS = 5_000;
export const POLL_BACKOFF_STEPS = [15_000, 30_000];
export const POLL_CALL_TIMEOUT_MS = 25_000;
export const POLL_RECOVERY_SUCCESSES = 3;

export interface PollTiming { successes: number; failures: number; intervalMs: number }
export const initialPollTiming = (): PollTiming => ({ successes: 0, failures: 0, intervalMs: POLL_BASE_MS });

/** Intervalo objetivo tras 1, 2, 3… fallos consecutivos (degradación 15→30 s, top 30 s). */
export function backoffIntervalMs(failures: number): number {
  if (failures <= 0) return POLL_BASE_MS;
  return POLL_BACKOFF_STEPS[Math.min(failures - 1, POLL_BACKOFF_STEPS.length - 1)];
}

/** Éxito: acumura; con POLL_RECOVERY_SUCCESSES éxitos seguidos se perdonan los fallos. */
export function applySuccess(t: PollTiming, recovery: number = POLL_RECOVERY_SUCCESSES): PollTiming {
  const successes = t.successes + 1;
  const failures = successes >= recovery && t.failures > 0 ? 0 : t.failures;
  return { successes, failures, intervalMs: backoffIntervalMs(failures) };
}

/** Fallo: reinicia éxitos, sube un peldaño de backoff (15 s → 30 s). */
export function applyFailure(t: PollTiming): PollTiming {
  const failures = t.failures + 1;
  return { successes: 0, failures, intervalMs: backoffIntervalMs(failures) };
}

export const isDegraded = (t: PollTiming): boolean => t.failures > 0;

/** Anti-solapamiento RE-04a: si hay una llamada en vuelo, la petición se encola (pending). */
export function planTick(inFlight: boolean): { run: boolean; pending: boolean } {
  return inFlight ? { run: false, pending: true } : { run: true, pending: false };
}

/** Retardo del próximo disparo encadenado: 0 si quedó una refresh encolada. */
export function nextDelayMs(pendingRefresh: boolean, intervalMs: number): number {
  return pendingRefresh ? 0 : intervalMs;
}
