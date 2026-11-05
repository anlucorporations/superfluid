import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { serverEnv } from "../env";
import { ApiError, clientIp, type RouteContext } from "../http";
import { sha256 } from "../auth";
import { consumeRateLimit, rateLimitKey } from "./rate-limit";

/**
 * Guardas comunes de las rutas API: sesión, CSRF, rate limit y parseo de `id`.
 * Se mantienen aquí para que todas las rutas apliquen la misma política (AC-08).
 */

export function requestIp(req: NextRequest): string {
  return clientIp(req);
}

export async function enforceRateLimit(
  req: NextRequest,
  wallet: string,
  limit = serverEnv.rateLimitMax,
  windowSeconds = serverEnv.rateLimitWindowSeconds,
): Promise<void> {
  const result = await consumeRateLimit(
    rateLimitKey(wallet, requestIp(req)),
    limit,
    windowSeconds,
  );
  if (!result.allowed) {
    throw new ApiError(
      429,
      "rate_limit",
      `Demasiados intentos. Reintenta en ${result.retryAfterSeconds} s.`,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

export async function readId(ctx: RouteContext): Promise<string> {
  const params = await ctx.params;
  const id = params.id;
  if (!id) throw new ApiError(400, "id_invalido", "Falta el identificador");
  return id;
}

export async function readParam(ctx: RouteContext, name: string): Promise<string> {
  const params = await ctx.params;
  const value = params[name];
  if (!value) throw new ApiError(400, "param_invalido", `Falta el parámetro ${name}`);
  return value;
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export { sha256 };
