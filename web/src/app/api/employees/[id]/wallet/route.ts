import { assertCsrf, requireAdmin } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { getSystemConfig } from "@/lib/repositories/system";
import { getEmployeeDoc, updateEmployeeWallet } from "@/lib/repositories/employees";
import { consumeNonce } from "@/lib/repositories/nonces";
import { readId } from "@/lib/repositories/guards";
import {
  ADMIN_STEP_UP_TYPES,
  CHANGE_WALLET_TYPES,
  changeWalletDomain,
  recoverTypedSigner,
} from "@/lib/eip712";
import { walletChangeRequestSchema } from "@/lib/validation";

const MAX_AGE_SECONDS = 15 * 60;

/**
 * POST /api/employees/:id/wallet
 * Cambio atómico de wallet (CU-03 / AC-03): valida la firma de la wallet nueva y el
 * step-up de la admin, consume el nonce y actualiza MongoDB + auditoría.
 * La transacción `changeReceiver` on-chain se firma en el navegador (H4).
 */
export const POST = handle(async (req, ctx) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = await readId(ctx);

  const body = await readJson(req, walletChangeRequestSchema);
  const employee = await getEmployeeDoc(id);
  if (!employee) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");
  if (employee.walletLower === body.newWallet.toLowerCase()) {
    throw new ApiError(422, "wallet_igual", "La wallet nueva es igual a la actual");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - body.issuedAt) > MAX_AGE_SECONDS) {
    throw new ApiError(401, "autorizacion_caducada", "La autorización ha caducado");
  }

  const config = await getSystemConfig();
  const domain = changeWalletDomain(config.chainId, config.brltXAddress);

  const employeeValue = {
    employeeId: id,
    oldWallet: employee.wallet,
    newWallet: body.newWallet,
    nonce: body.nonce,
    issuedAt: body.issuedAt,
  };
  const adminValue = { action: "change_wallet", ...employeeValue };

  let employeeSigner: string;
  let adminSigner: string;
  try {
    employeeSigner = recoverTypedSigner(
      domain,
      CHANGE_WALLET_TYPES,
      employeeValue,
      body.employeeSignature,
    );
    adminSigner = recoverTypedSigner(
      domain,
      ADMIN_STEP_UP_TYPES,
      adminValue,
      body.adminSignature,
    );
  } catch {
    throw new ApiError(401, "firma_invalida", "No se pudo recuperar el firmante");
  }

  if (employeeSigner.toLowerCase() !== body.newWallet.toLowerCase()) {
    throw new ApiError(401, "firma_invalida", "La firma no corresponde a la wallet nueva");
  }
  if (adminSigner.toLowerCase() !== session.wallet.toLowerCase()) {
    throw new ApiError(401, "firma_invalida", "El step-up no corresponde a la wallet admin");
  }

  await consumeNonce({
    nonce: body.nonce,
    wallet: body.newWallet,
    purpose: "wallet_change",
  });

  const updated = await updateEmployeeWallet(id, body.newWallet, session.wallet);
  return ok({ employee: updated });
});
