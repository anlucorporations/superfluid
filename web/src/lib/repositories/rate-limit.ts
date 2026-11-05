import { ensureIndexes } from "../db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  count: number;
}

interface RateLimitDoc {
  key: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

/**
 * Consumo atómico de una ventana fija. Devuelve `allowed=false` en cuanto se
 * supera el límite, sin bloquear la ventana siguiente.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = await ensureIndexes();
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  const updated = await db.collection<RateLimitDoc>("auth_ratelimits").findOneAndUpdate(
    { key },
    [
      {
        $set: {
          count: {
            $cond: [{ $lt: ["$expiresAt", now] }, 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }],
          },
          windowStart: { $cond: [{ $lt: ["$expiresAt", now] }, now, "$windowStart"] },
          expiresAt: { $cond: [{ $lt: ["$expiresAt", now] }, resetAt, "$expiresAt"] },
        },
      },
    ],
    { upsert: true, returnDocument: "after" },
  );

  const count = Number(updated?.count ?? 1);
  const expiresAt: Date = updated?.expiresAt ?? resetAt;
  const retryAfterSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
    count,
  };
}

/** Clave de rate limit por wallet + IP (CU-01/CU-13). */
export function rateLimitKey(wallet: string, ip: string): string {
  return `${wallet.toLowerCase()}|${ip}`;
}
