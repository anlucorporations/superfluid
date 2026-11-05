import { PERIODOS, type Periodo } from "./types";

/** Segundos por periodo (6/15/30/90 días). */
export const PERIOD_SECONDS: Record<Periodo, number> = {
  6: 518_400,
  15: 1_296_000,
  30: 2_592_000,
  90: 7_776_000,
};

export const PERIOD_LABELS: Record<Periodo, string> = {
  6: "6 días",
  15: "15 días",
  30: "30 días",
  90: "90 días",
};

export const WEI_PER_BRLT = 10n ** 18n;

/**
 * Tasa de flujo con floor al wei (regla H-06).
 * Ej.: 2.000 BRLT / 30 días = 771604938271604 wei/s.
 */
export function flowRateFor(amountWei: string | bigint, periodo: Periodo): string {
  const amount = typeof amountWei === "string" ? BigInt(amountWei) : amountWei;
  const seconds = BigInt(PERIOD_SECONDS[periodo]);
  if (seconds <= 0n) throw new Error("periodo invalido");
  return (amount / seconds).toString();
}

/** Residuo del floor que queda en escrow y vuelve al admin. */
export function residueFor(amountWei: string | bigint, periodo: Periodo): string {
  const amount = typeof amountWei === "string" ? BigInt(amountWei) : amountWei;
  const rate = BigInt(flowRateFor(amount, periodo));
  return (amount - rate * BigInt(PERIOD_SECONDS[periodo])).toString();
}

/** Convierte una cantidad decimal en BRLT ("2000", "2000.5") a wei. */
export function parseBrlt(value: string): string {
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{0,18}))?$/.exec(normalized);
  if (!match) throw new Error("importe BRLT invalido");
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(18, "0");
  return (whole * WEI_PER_BRLT + BigInt(fraction)).toString();
}

/** Formatea wei de BRLT como decimal legible, sin notación científica. */
export function formatBrlt(wei: string | bigint, maxDecimals = 4): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / WEI_PER_BRLT;
  const fraction = abs % WEI_PER_BRLT;
  let decimals = fraction.toString().padStart(18, "0").slice(0, maxDecimals).replace(/0+$/, "");
  if (!decimals) decimals = "0";
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${decimals}`;
}

export function isPeriodo(value: number): value is Periodo {
  return (PERIODOS as readonly number[]).includes(value);
}

/** Wei → decimal sin agrupación, apto para inputs de formulario ("2000.5"). */
export function toDecimalString(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const whole = value / WEI_PER_BRLT;
  const fraction = (value % WEI_PER_BRLT).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Proyección mensual informativa (30 días) a partir de la tasa. */
export function monthlyProjection(rateWeiPerSecond: string): string {
  return (BigInt(rateWeiPerSecond) * BigInt(PERIOD_SECONDS[30])).toString();
}

/** Proyección diaria informativa. */
export function dailyProjection(rateWeiPerSecond: string): string {
  return (BigInt(rateWeiPerSecond) * 86_400n).toString();
}

/** Duración legible a partir de segundos ("6 días", "2 h 15 min"). */
export function humanDuration(seconds: number): string {
  if (seconds <= 0) return "0 s";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** Tiempo restante legible hasta una fecha ISO. */
export function timeLeft(isoDate: string): string {
  const diff = Math.floor((new Date(isoDate).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "vencido";
  return humanDuration(diff);
}
