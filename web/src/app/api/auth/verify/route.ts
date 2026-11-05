import { SiweMessage } from "siwe";
import { attachSessionCookies, createSession } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { recordAudit } from "@/lib/repositories/audit";
import { isAllowedAdmin } from "@/lib/repositories/allowlist";
import { getEmployeeByWallet } from "@/lib/repositories/employees";
import { enforceRateLimit } from "@/lib/repositories/guards";
import { consumeNonce, findNonce } from "@/lib/repositories/nonces";
import { verifySiweSignature } from "@/lib/siwe";
import { verifyRequestSchema } from "@/lib/validation";

/**
 * POST /api/auth/verify
 * Verifica la firma SIWE, consume el nonce y crea la sesión opaca.
 * - purpose `admin`: exige wallet activa en `admin_allowlist` (CU-01).
 * - purpose `suite`: exige empleado activo con esa wallet (CU-13).
 */
export const POST = handle(async (req) => {
  const body = await readJson(req, verifyRequestSchema);

  let parsed: SiweMessage;
  try {
    parsed = new SiweMessage(body.message);
  } catch {
    throw new ApiError(400, "siwe_invalido", "Mensaje SIWE mal formado");
  }

  const nonceDoc = await findNonce(parsed.nonce);
  if (!nonceDoc) {
    throw new ApiError(401, "nonce_invalido", "Nonce inexistente o expirado");
  }
  if (nonceDoc.purpose === "wallet_change") {
    throw new ApiError(400, "nonce_invalido", "Nonce no válido para inicio de sesión");
  }
  if (nonceDoc.usedAt || nonceDoc.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, "nonce_invalido", "Nonce expirado o ya usado");
  }

  await enforceRateLimit(req, nonceDoc.wallet);

  if (parsed.address.toLowerCase() !== nonceDoc.walletLower) {
    throw new ApiError(401, "firma_invalida", "La wallet del mensaje no coincide con el nonce");
  }

  await verifySiweSignature({
    message: body.message,
    signature: body.signature,
    expectedAddress: nonceDoc.wallet,
    expectedNonce: parsed.nonce,
  });

  await consumeNonce({
    nonce: parsed.nonce,
    wallet: nonceDoc.wallet,
    purpose: nonceDoc.purpose,
  });

  if (nonceDoc.purpose === "admin") {
    const allowed = await isAllowedAdmin(nonceDoc.wallet);
    if (!allowed) {
      throw new ApiError(
        403,
        "no_autorizado",
        "Wallet no autorizada para el panel de administración",
      );
    }
    const issued = await createSession({
      wallet: nonceDoc.wallet,
      role: "admin",
      employeeId: null,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await recordAudit({ actorWallet: nonceDoc.wallet, accion: "login", meta: { role: "admin" } });

    const response = ok({
      session: {
        wallet: issued.session.wallet,
        role: issued.session.role,
        employeeId: null,
        expiresAt: issued.expiresAt.toISOString(),
      },
    });
    return attachSessionCookies(response, issued);
  }

  const employee = await getEmployeeByWallet(nonceDoc.wallet);
  // Retiro tras la baja (AC-10): la wallet mantiene acceso de solo retiro
  // durante 90 días tras `deactivatedAt`; después el login queda denegado.
  const RETIRO_MS = 90 * 24 * 3_600_000;
  const authOk =
    employee?.estado === "activo" ||
    (employee?.deactivatedAt !== null &&
      employee?.deactivatedAt !== undefined &&
      Date.now() - employee.deactivatedAt.getTime() < RETIRO_MS);
  if (!employee || !authOk) {
    throw new ApiError(403, "no_autorizado", "Wallet no autorizada para la Suite del Empleado");
  }

  const issued = await createSession({
    wallet: nonceDoc.wallet,
    role: "empleado",
    employeeId: employee._id,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  await recordAudit({
    actorWallet: nonceDoc.wallet,
    accion: "login",
    empleadoId: employee._id.toString(),
    meta: { role: "empleado" },
  });

  const response = ok({
    session: {
      wallet: issued.session.wallet,
      role: issued.session.role,
      employeeId: employee._id.toString(),
      expiresAt: issued.expiresAt.toISOString(),
    },
  });
  return attachSessionCookies(response, issued);
});
