import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { createPgDb, createPool } from './db.js';

/**
 * Runner de migraciones idempotente (H2). Aplica `migrations/*.sql` en orden y
 * registra la versión en `schema_migrations`. El DDL base es reejecutable.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const pool = createPool(cfg.DATABASE_URL);
  const db = createPgDb(pool);
  const dir = resolve('migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await db.query(
    `create table if not exists schema_migrations (
       version text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  let applied = 0;
  for (const file of files) {
    const exists = await db.query('select 1 from schema_migrations where version=$1', [file]);
    if (exists.length > 0) {
      console.log(`skip ${file} (ya aplicada)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.withTx(async (tx) => {
      await tx.query(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [file]);
    });
    applied++;
    console.log(`applied ${file}`);
  }
  console.log(JSON.stringify({ migrations: files.length, applied }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
