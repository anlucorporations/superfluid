import { loadConfig, parseGatewaySecrets } from './config.js';
import { createEthersChain, type ChainClient } from './chain.js';
import { createPgDb, createPool, type Db } from './db.js';
import { MemoryTaskQueue, CloudTasksQueue, metadataAccessToken, type TaskQueue } from './tasks.js';
import { createAdapterRegistry, parseGatewayRuntimeConfigs } from './gateways/registry.js';
import { runIndexerOnce } from './jobs/indexer.js';
import { runHealthOnce } from './jobs/health.js';
import { runPurgeOnce } from './jobs/purge.js';
import { buildServer } from './server.js';

function buildQueue(cfg: ReturnType<typeof loadConfig>): TaskQueue {
  if (!cfg.CLOUD_TASKS_PROJECT) return new MemoryTaskQueue();
  return new CloudTasksQueue({
    project: cfg.CLOUD_TASKS_PROJECT,
    location: cfg.CLOUD_TASKS_LOCATION,
    serviceAccountEmail: `sfh-orchestrator@${cfg.CLOUD_TASKS_PROJECT}.iam.gserviceaccount.com`,
    getAccessToken: metadataAccessToken,
  });
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const mode = process.argv[2] ?? 'serve';
  const pool = createPool(cfg.DATABASE_URL, cfg.DB_POOL_MAX);
  const db = createPgDb(pool);
  const chain: ChainClient =
    cfg.SUPER_TOKEN_ADDRESS && cfg.SUPER_TOKEN_ADDRESS.startsWith('0x')
      ? createEthersChain(cfg.RPC_URL, cfg.SUPER_TOKEN_ADDRESS)
      : {
          async blockNumber() {
            throw new Error('chain no configurada (SUPER_TOKEN_ADDRESS)');
          },
          async getFlow() {
            throw new Error('chain no configurada');
          },
          async getTransactionObservation() {
            throw new Error('chain no configurada');
          },
          async getLogs() {
            throw new Error('chain no configurada');
          },
        };

  // ------------------------------------------------- Cloud Run Jobs (D42)
  if (mode === 'indexer') {
    const out = await runIndexerOnce({
      db,
      chain,
      chainId: cfg.CHAIN_ID,
      contractAddress: cfg.SUPER_TOKEN_ADDRESS,
      confirmations: cfg.INDEXER_CONFIRMATIONS,
    });
    console.log(JSON.stringify({ job: 'indexer', ...out }));
    await pool.end();
    return;
  }
  if (mode === 'purge') {
    const out = await runPurgeOnce({ db });
    console.log(JSON.stringify({ job: 'purge', ...out }));
    await pool.end();
    return;
  }
  if (mode === 'health') {
    const adapterFor = createAdapterRegistry(parseGatewayRuntimeConfigs(cfg.GATEWAY_RUNTIME_CONFIGS));
    const out = await runHealthOnce({ db, chain, adapterFor });
    console.log(JSON.stringify({ job: 'health', ...out }));
    await pool.end();
    return;
  }

  // --------------------------------------------------------------- servidor
  void parseGatewaySecrets(cfg.GATEWAY_HMAC_SECRETS);
  const queue = buildQueue(cfg);
  const adapterFor = createAdapterRegistry(parseGatewayRuntimeConfigs(cfg.GATEWAY_RUNTIME_CONFIGS));
  const app = await buildServer({ cfg, db, queue, chain, adapterFor });
  await app.listen({ port: cfg.API_PORT, host: '0.0.0.0' });
  app.log.info({ port: cfg.API_PORT, mode: cfg.MEMPOOL_MODE }, 'sfh-orchestrator up');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
