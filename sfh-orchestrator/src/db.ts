import pg from 'pg';

export interface Db {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  withTx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export function createPool(connectionString: string, max = 10): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL no configurada');
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

export function createPgDb(client: pg.Pool | pg.PoolClient): Db {
  const db: Db = {
    async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) {
      const res = await client.query<T>(text, params as unknown[] | undefined);
      return res.rows;
    },
    async withTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (!('connect' in client)) {
        return fn(db); // ya estamos dentro de una transacción/cliente
      }
      const conn = await (client as pg.Pool).connect();
      try {
        await conn.query('BEGIN');
        const tx = createPgDb(conn);
        const out = await fn(tx);
        await conn.query('COMMIT');
        return out;
      } catch (err) {
        await conn.query('ROLLBACK');
        throw err;
      } finally {
        conn.release();
      }
    },
  };
  return db;
}

/** Aplica un .sql multi-sentencia (DDL) sobre la conexión. */
export async function applySqlFile(db: Db, sql: string): Promise<void> {
  await db.query(sql);
}
