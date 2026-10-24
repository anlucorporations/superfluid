import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** Carga un .env plano si existe (sin dependencias externas). No sobreescribe env. */
function loadDotenv(path = '.env'): void {
  try {
    const txt = readFileSync(path, 'utf8');
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // sin .env: se usan variables de entorno
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().default(''),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  RPC_URL: z.string().default(''),
  CHAIN_ID: z.coerce.number().int().default(81234),
  SUPER_TOKEN_ADDRESS: z.string().default(''),
  UNDERLYING_ADDRESS: z.string().default(''),

  INDEXER_POLL_MS: z.coerce.number().int().positive().default(60_000),
  HEALTHCHECK_MS: z.coerce.number().int().positive().default(60_000),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(2),
  INDEXER_REORG_WINDOW: z.coerce.number().int().nonnegative().default(12),
  REVOCATION_SLA_MS: z.coerce.number().int().positive().default(10_000),
  PROVISIONAL_SECONDS: z.coerce.number().int().positive().max(300).default(60),
  MEMPOOL_MODE: z.enum(['visible', 'receipt']).default('receipt'),

  CORS_ORIGIN: z.string().default(''),

  CLOUD_TASKS_PROJECT: z.string().default(''),
  CLOUD_TASKS_LOCATION: z.string().default('europe-west1'),
  CLOUD_TASKS_QUEUE_AUTH: z.string().default('authorize-validation'),
  CLOUD_TASKS_QUEUE_EXPIRY: z.string().default('provisional-expiry'),
  INTERNAL_BASE_URL: z.string().default('http://localhost:8080'),

  JWT_SECRET: z.string().min(16).default('dev-only-change-me-please-32chars'),
  INTERNAL_SECRET: z.string().min(8).default('dev-internal-secret-change-me'),
  API_KEY_PEPPER: z.string().min(8).default('dev-pepper-change-me'),
  GATEWAY_HMAC_SECRETS: z.string().default(''),
  GATEWAY_RUNTIME_CONFIGS: z.string().default(''),
  BIND_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  BIND_HMAC_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  loadDotenv(env.DOTENV_PATH ?? '.env');
  return EnvSchema.parse(env);
}

/** Parse `gid=secret,gid2=secret2` en un mapa de secretos HMAC por gateway. */
export function parseGatewaySecrets(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [gid, ...rest] = pair.split('=');
    if (gid && rest.length > 0) out[gid.trim()] = rest.join('=').trim();
  }
  return out;
}
