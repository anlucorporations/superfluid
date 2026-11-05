import { MongoClient, type Db } from "mongodb";
import { serverEnv } from "./env";

type MongoGlobal = typeof globalThis & {
  __sfMongoClient?: Promise<MongoClient>;
  __sfMongoIndexes?: Promise<void>;
};

const globalForMongo = globalThis as MongoGlobal;

export function getClient(): Promise<MongoClient> {
  if (!globalForMongo.__sfMongoClient) {
    const client = new MongoClient(serverEnv.mongoUri, {
      appName: "superfluid-v2",
      serverSelectionTimeoutMS: 5_000,
    });
    globalForMongo.__sfMongoClient = client.connect();
  }
  return globalForMongo.__sfMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(serverEnv.mongoDb);
}

/** Crea índices idempotentes una sola vez por proceso. */
export async function ensureIndexes(): Promise<Db> {
  const db = await getDb();
  if (!globalForMongo.__sfMongoIndexes) {
    globalForMongo.__sfMongoIndexes = (async () => {
      await Promise.all([
        db.collection("employees").createIndex({ walletLower: 1 }, { unique: true }),
        db.collection("employees").createIndex({ estado: 1, proyectoId: 1 }),
        db.collection("projects").createIndex({ nombre: 1 }, { unique: true }),
        db.collection("admin_allowlist").createIndex({ walletLower: 1 }, { unique: true }),
        db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection("sessions").createIndex({ walletLower: 1, revokedAt: 1 }),
        db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("siwe_nonces").createIndex({ nonceHash: 1 }, { unique: true }),
        db.collection("siwe_nonces").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("audit_events").createIndex({ createdAt: -1 }),
        db.collection("audit_events").createIndex({ empleadoId: 1, createdAt: -1 }),
        db.collection("auth_ratelimits").createIndex({ key: 1 }, { unique: true }),
        db.collection("auth_ratelimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("flows").createIndex({ flowId: 1 }, { unique: true }),
        db.collection("flows").createIndex({ employeeId: 1, estado: 1 }),
        db.collection("flows").createIndex({ estado: 1, endsAt: 1 }),
        db.collection("flows").createIndex({ receiverLower: 1, estado: 1 }),
        db.collection("scheduled_flows").createIndex({ fechaInicio: 1, estado: 1 }),
        db.collection("scheduled_flows").createIndex({ employeeId: 1 }),
        db.collection("flow_batches").createIndex({ createdAt: -1 }),
        db.collection("flows_history").createIndex({ key: 1 }, { unique: true }),
        db.collection("flows_history").createIndex({ flowId: 1, blockNumber: 1 }),
        db.collection("job_runs").createIndex({ job: 1, startedAt: -1 }),
      ]);
    })().catch((error) => {
      globalForMongo.__sfMongoIndexes = undefined;
      throw error;
    });
  }
  await globalForMongo.__sfMongoIndexes;
  return db;
}

/** Utilidad de tests: cierra el cliente y limpia la caché global. */
export async function closeMongo(): Promise<void> {
  const cached = globalForMongo.__sfMongoClient;
  globalForMongo.__sfMongoClient = undefined;
  globalForMongo.__sfMongoIndexes = undefined;
  if (cached) {
    const client = await cached;
    await client.close();
  }
}
