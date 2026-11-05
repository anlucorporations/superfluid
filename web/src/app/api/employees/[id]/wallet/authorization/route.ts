import { assertCsrf, requireAdmin } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { getSystemConfig } from "@/lib/repositories/system";
import { getEmployeeDoc } from "@/lib/repositories/employees";
import { issueNonce } from "@/lib/repositories/nonces";
import { readId } from "@/lib/repositories/guards";
import {
  ADMIN_STEP_UP_TYPES,
  CHANGE_WALLET_TYPES,
  changeWalletDomain,
} from "@/lib/eip712";
import { walletChangeAuthorizationSchema } from "@/lib/validation";

/**
 * POST /api/employees/:id/wallet/authorization
 * Prepara el cambio de wallet (CU-03 paso 4 / AC-03): emite un nonce ligado a la
 * wallet nueva y devuelve los dos conjuntos EIP-712 que deben firmarse.
 */
export const POST = handle(async (req, ctx) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = await readId(ctx);

  const body = await readJson(req, walletChangeAuthorizationSchema);
  if (body.employeeId !== id) {
    throw new ApiError(400, "id_invalido", "El empleado del cuerpo no coincide con la ruta");
  }

  const employee = await getEmployeeDoc(id);
  if (!employee) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");
  if (employee.walletLower === body.newWallet.toLowerCase()) {
    throw new ApiError(422, "wallet_igual", "La wallet nueva es igual a la actual");
  }

  const config = await getSystemConfig();
  const { nonce, expiresAt } = await issueNonce({
    wallet: body.newWallet,
    purpose: "wallet_change",
  });
  const issuedAt = Math.floor(Date.now() / 1000);

  const employeeValue = {
    employeeId: id,
    oldWallet: employee.wallet,
    newWallet: body.newWallet,
    nonce,
    issuedAt,
  };

  return ok({
    nonce,
    issuedAt,
    expiresAt: expiresAt.toISOString(),
    domain: changeWalletDomain(config.chainId, config.brltXAddress),
    types: { employee: CHANGE_WALLET_TYPES, admin: ADMIN_STEP_UP_TYPES },
    employeeValue,
    adminValue: { action: "change_wallet", ...employeeValue },
  });
});
