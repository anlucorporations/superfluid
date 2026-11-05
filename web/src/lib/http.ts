import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validacion",
          message: "Datos inválidos",
          details: error.flatten(),
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  const maybeMongo = error as { code?: number; keyPattern?: Record<string, unknown> };
  if (maybeMongo?.code === 11000) {
    return NextResponse.json(
      {
        error: {
          code: "duplicado",
          message: "Ya existe un registro con ese valor único (wallet o nombre).",
          details: maybeMongo.keyPattern ?? null,
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("[api] error no controlado:", error);
  return NextResponse.json(
    { error: { code: "interno", message: "Error interno del servidor" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export type RouteContext = { params: Promise<Record<string, string>> };

export function handle(
  fn: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
): (req: NextRequest, ctx: RouteContext) => Promise<NextResponse> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      return failure(error);
    }
  };
}

export async function readJson<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    throw new ApiError(400, "json_invalido", "El cuerpo de la petición no es JSON válido");
  }
  return schema.parse(payload);
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}
