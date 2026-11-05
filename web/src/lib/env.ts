/**
 * Configuración del servidor. Los valores públicos se leen también en el cliente
 * mediante `process.env.NEXT_PUBLIC_*` (sustituidos en build time).
 */

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const serverEnv = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGODB_DB ?? "superfluid",
  siweDomain: process.env.SIWE_DOMAIN ?? "localhost:3000",
  nonceTtlSeconds: num(process.env.SIWE_NONCE_TTL_SECONDS, 5 * 60),
  adminSessionSeconds: num(process.env.SESSION_TTL_ADMIN_SECONDS, 2 * 60 * 60),
  employeeSessionSeconds: num(process.env.SESSION_TTL_EMPLOYEE_SECONDS, 8 * 60 * 60),
  rateLimitMax: num(process.env.AUTH_RATE_LIMIT, 5),
  rateLimitWindowSeconds: num(process.env.AUTH_RATE_WINDOW_SECONDS, 15 * 60),
  adminBootstrapWallet: process.env.ADMIN_BOOTSTRAP_WALLET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

export const publicEnv = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://besu.alumnos.codecrypto.academy",
  chainId: num(process.env.NEXT_PUBLIC_CHAIN_ID, 81234),
  brltAddress: process.env.NEXT_PUBLIC_BRLT_ADDRESS ?? "",
  brltXAddress: process.env.NEXT_PUBLIC_BRLTX_ADDRESS ?? "",
  faucetUrl: process.env.NEXT_PUBLIC_FAUCET_URL ?? "https://faucet.codecrypto.academy/",
};
