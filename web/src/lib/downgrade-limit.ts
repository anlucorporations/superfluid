import { ensureIndexes } from "./db";
import { ApiError } from "./http";
import { listFlowsByReceiver } from "./repositories/flows";
import type { FlowDto } from "./types";

/**
 * Tope de downgrade del 80% (CU-16 ampliado).
 *
 * El empleado solo puede obtener en BRLT, acumulativamente, el 80% del total
 * asignado a su cuenta (suma de `deposited` de todos los flujos que le fueron
 * creados, vivos o terminados). Lo ya cobrado se reconstruye de la auditoría:
 * los eventos `Downgraded` verificados contra la cadena quedan registrados en
 * `audit_events` (operación "cobro"), así que esa colección es la fuente del
 * gasto acumulado. La verdad del asignado siempre es el contrato (vía Mongo
 * reconciliada en cada lectura de flujos).
 */

/** Fracción máxima cobrable sobre lo asignado. Constante de producto. */
export const DOWNGRADE_CAP = 80n;
export const DOWNGRADE_CAP_DEN = 100n;

export interface DowngradeLimitDto {
  /** Total asignado a la cuenta (wei, suma de deposited de sus flujos). */
  asignadoTotal: string;
  /** Techo cobrable: 80% de asignadoTotal (wei, floor). */
  downgradeMaximo: string;
  /** BRLT ya obtenido vía downgrade acumulado (wei). */
  downgradeUsado: string;
  /** Resto disponible: máximo − usado, nunca negativo (wei). */
  downgradeDisponible: string;
}

/** 80% con floor al wei: floor((asignado * 80) / 100). */
export function downgradeMaximoDe(asignadoTotal: bigint): bigint {
  return (asignadoTotal * DOWNGRADE_CAP) / DOWNGRADE_CAP_DEN;
}

/** Suma de lo ya cobrado según auditoría (eventos "cobro" verificados). */
async function downgradeUsadoDe(walletLower: string): Promise<bigint> {
  const db = await ensureIndexes();
  const docs = await db
    .collection("audit_events")
    .find({
      actorWallet: walletLower,
      accion: "flujo",
      "meta.operacion": "cobro",
    })
    .project({ "meta.amount": 1 })
    .limit(1000)
    .toArray();
  let usado = 0n;
  for (const doc of docs) {
    const amount = (doc as { meta?: { amount?: unknown } }).meta?.amount;
    if (typeof amount === "string" && /^\d+$/.test(amount)) {
      try {
        usado += BigInt(amount);
      } catch {
        // amount corrupto: se ignora, no bloquea
      }
    }
  }
  return usado;
}

export async function getDowngradeLimit(wallet: string): Promise<DowngradeLimitDto> {
  const walletLower = wallet.toLowerCase();
  const flows: FlowDto[] = await listFlowsByReceiver(wallet);
  const asignadoTotal = flows.reduce((total, flow) => total + BigInt(flow.deposited), 0n);
  const maximo = downgradeMaximoDe(asignadoTotal);
  const usado = await downgradeUsadoDe(walletLower);
  const disponible = maximo > usado ? maximo - usado : 0n;
  return {
    asignadoTotal: asignadoTotal.toString(),
    downgradeMaximo: maximo.toString(),
    downgradeUsado: usado.toString(),
    downgradeDisponible: disponible.toString(),
  };
}

/**
 * Exigencia del tope: `importe` no puede hacer que el acumulado cobrado supere
 * el 80% de lo asignado. Se llama antes de registrar un cobro verificado.
 */
export function assertDowngradeLimit(limite: DowngradeLimitDto, importe: bigint): void {
  if (importe <= 0n) {
    throw new ApiError(422, "importe_invalido", "El importe del downgrade debe ser mayor que 0");
  }
  const usado = BigInt(limite.downgradeUsado) + importe;
  const maximo = BigInt(limite.downgradeMaximo);
  if (usado > maximo) {
    throw new ApiError(
      422,
      "tope_80_superado",
      `El tope del 80% se superaría: disponible ${limite.downgradeDisponible} wei, solicitado ${importe.toString()} wei`,
    );
  }
}
