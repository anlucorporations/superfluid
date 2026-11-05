import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { ensureIndexes } from "./db";
import { serverEnv } from "./env";
import { ApiError } from "./http";
import type { Role, SessionDoc } from "./types";

export const SESSION_COOKIE = "sf_session";
export const CSRF_COOKIE = "sf_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface NewSessionInput {
  wallet: string;
  role: Role;
  employeeId: ObjectId | null;
  userAgent?: string;
}

export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  session: SessionDoc;
}

/** Crea una sesión opaca: solo el hash del token se guarda en MongoDB. */
export async function createSession(input: NewSessionInput): Promise<IssuedSession> {
  const db = await ensureIndexes();
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("hex");
  const ttlSeconds =
    input.role === "admin" ? serverEnv.adminSessionSeconds : serverEnv.employeeSessionSeconds;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const doc: Omit<SessionDoc, "_id"> = {
    tokenHash: sha256(token),
    wallet: input.wallet,
    walletLower: input.wallet.toLowerCase(),
    role: input.role,
    employeeId: input.employeeId,
    csrfToken,
    createdAt: now,
    expiresAt,
    revokedAt: null,
    userAgent: input.userAgent?.slice(0, 200),
  };

  const result = await db.collection<SessionDoc>("sessions").insertOne(doc as SessionDoc);
  return { token, csrfToken, expiresAt, session: { _id: result.insertedId, ...doc } };
}

export function attachSessionCookies(
  response: NextResponse,
  issued: { token: string; csrfToken: string; expiresAt: Date },
): NextResponse {
  const maxAge = Math.max(1, Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000));
  const base = {
    secure: serverEnv.isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
  response.cookies.set(SESSION_COOKIE, issued.token, { ...base, httpOnly: true });
  // El token CSRF debe ser legible por el JS del mismo origen (double-submit).
  response.cookies.set(CSRF_COOKIE, issued.csrfToken, { ...base, httpOnly: false });
  return response;
}

export function clearSessionCookies(response: NextResponse): NextResponse {
  const base = { path: "/", secure: serverEnv.isProduction, sameSite: "strict" as const, maxAge: 0 };
  response.cookies.set(SESSION_COOKIE, "", { ...base, httpOnly: true });
  response.cookies.set(CSRF_COOKIE, "", { ...base, httpOnly: false });
  return response;
}

export async function getSession(req: NextRequest): Promise<SessionDoc | null> {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const db = await ensureIndexes();
  const session = await db.collection<SessionDoc>("sessions").findOne({ tokenHash: sha256(raw) });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function requireSession(req: NextRequest): Promise<SessionDoc> {
  const session = await getSession(req);
  if (!session) throw new ApiError(401, "no_autenticado", "Sesión no válida o expirada");
  return session;
}

export async function requireAdmin(req: NextRequest): Promise<SessionDoc> {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    throw new ApiError(403, "prohibido", "Se requiere rol administrador");
  }
  return session;
}

export async function requireEmployee(req: NextRequest): Promise<SessionDoc> {
  const session = await requireSession(req);
  if (session.role !== "empleado") {
    throw new ApiError(403, "prohibido", "Se requiere rol empleado");
  }
  return session;
}

/** CSRF double-submit: header y cookie deben coincidir con el token de la sesión. */
export function assertCsrf(req: NextRequest, session: SessionDoc): void {
  const header = req.headers.get(CSRF_HEADER) ?? "";
  const cookie = req.cookies.get(CSRF_COOKIE)?.value ?? "";
  if (!header || !cookie) {
    throw new ApiError(403, "csrf", "Falta el token CSRF");
  }
  const expected = Buffer.from(session.csrfToken);
  const givenHeader = Buffer.from(header);
  const givenCookie = Buffer.from(cookie);
  if (
    givenHeader.length !== expected.length ||
    !timingSafeEqual(givenHeader, expected) ||
    givenCookie.length !== expected.length ||
    !timingSafeEqual(givenCookie, expected)
  ) {
    throw new ApiError(403, "csrf", "Token CSRF inválido");
  }
}

export async function revokeSession(sessionId: ObjectId): Promise<void> {
  const db = await ensureIndexes();
  await db
    .collection<SessionDoc>("sessions")
    .updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
}

/** Revocación inmediata al dar de baja a un empleado (AC-08 / CU-03 A5). */
export async function revokeSessionsByWallet(walletLower: string): Promise<number> {
  const db = await ensureIndexes();
  const result = await db
    .collection<SessionDoc>("sessions")
    .updateMany({ walletLower, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return result.modifiedCount;
}
