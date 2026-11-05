import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/http";
import { healthcheck } from "@/lib/repositories/system";

/** GET /api/health — sonda para Cloud Run (H7). */
export const GET = handle(async () => {
  const health = await healthcheck();
  const healthy = health.db && health.rpc;
  const response = NextResponse.json(
    {
      data: {
        status: healthy ? "ok" : "degradado",
        ...health,
      },
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
  return response;
});

export const dynamic = "force-dynamic";
