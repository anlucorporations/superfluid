"use client";

export class ClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
}

/** Cliente HTTP con CSRF double-submit y errores tipados. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("sf_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new ClientError(
      response.status,
      payload?.error?.code ?? "error",
      payload?.error?.message ?? `Error ${response.status}`,
      payload?.error?.details,
    );
  }
  return payload?.data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
