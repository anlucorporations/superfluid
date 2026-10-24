import type { Db } from '../db.js';
import type { ChainClient } from '../chain.js';

export interface IndexerDeps {
  db: Db;
  chain: ChainClient;
  chainId: number;
  contractAddress: string;
  confirmations: number;
  leaseMs?: number;
  holder?: string;
}

/**
 * D42/RNF-05: una pasada del indexador (Job de 1 min) con lease + CAS.
 * Procesa solo eventos confirmados a N bloques; idempotente por (chain,tx,log).
 */
export async function runIndexerOnce(deps: IndexerDeps): Promise<{
  acquired: boolean;
  processed: number;
  fromBlock: number;
  toBlock: number;
}> {
  const holder = deps.holder ?? `job-${process.pid}`;
  const leaseMs = deps.leaseMs ?? 60_000;

  await deps.db.query(
    `insert into indexer_checkpoints (chain_id, contract_address) values ($1,$2)
     on conflict (chain_id, contract_address) do nothing`,
    [deps.chainId, deps.contractAddress.toLowerCase()],
  );

  const acquired = await deps.db.query<{ version: string }>(
    `update indexer_checkpoints
        set leased_by=$3, lease_expires_at=now() + ($4 || ' milliseconds')::interval, version=version+1, updated_at=now()
      where chain_id=$1 and contract_address=$2
        and (leased_by is null or lease_expires_at is null or lease_expires_at < now())
      returning version::text as version`,
    [deps.chainId, deps.contractAddress.toLowerCase(), holder, String(leaseMs)],
  );
  if (acquired.length === 0) {
    return { acquired: false, processed: 0, fromBlock: 0, toBlock: 0 };
  }

  try {
    const [cp] = await deps.db.query<{
      last_processed_block: string;
      last_processed_log_index: number;
    }>(
      `select last_processed_block::text as last_processed_block, last_processed_log_index
         from indexer_checkpoints where chain_id=$1 and contract_address=$2`,
      [deps.chainId, deps.contractAddress.toLowerCase()],
    );
    const fromBlock = Number(cp?.last_processed_block ?? 0) + 1;
    const latest = await deps.chain.blockNumber();
    const toBlock = latest - deps.confirmations;
    if (fromBlock > toBlock) {
      await release(deps, holder, Number(cp?.last_processed_block ?? 0), cp?.last_processed_log_index ?? -1);
      return { acquired: true, processed: 0, fromBlock, toBlock };
    }

    const logs = await deps.chain.getLogs(fromBlock, toBlock);
    let processed = 0;
    let lastLogIndex = cp?.last_processed_log_index ?? -1;

    for (const log of logs) {
      const inserted = await deps.db.query<{ id: string }>(
        `insert into flow_events (chain_id, contract_address, event_type, tx_hash, log_index, block_number,
            block_hash, sender_wallet, receiver_wallet, flow_rate_wei_s, amount_wei, payload, processing_status, processed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'processed',now())
         on conflict (chain_id, tx_hash, log_index) do nothing
         returning id`,
        [
          deps.chainId,
          deps.contractAddress.toLowerCase(),
          log.eventType,
          log.txHash,
          log.logIndex,
          log.blockNumber,
          log.blockHash,
          log.sender ?? null,
          log.receiver ?? null,
          log.flowRateWei?.toString() ?? null,
          log.amountWei?.toString() ?? null,
          JSON.stringify(log.payload),
        ],
      );
      if (inserted.length === 0) continue;
      processed++;
      lastLogIndex = Math.max(lastLogIndex, log.logIndex);

      if (log.sender && log.receiver) {
        await applyProjection(deps, log.eventType, log.sender, log.receiver, log.flowRateWei, inserted[0]!.id);
      }
    }

    await release(deps, holder, toBlock, lastLogIndex);
    return { acquired: true, processed, fromBlock, toBlock };
  } catch (err) {
    await deps.db.query(
      `update indexer_checkpoints set leased_by=null, lease_expires_at=null, updated_at=now()
        where chain_id=$1 and contract_address=$2 and leased_by=$3`,
      [deps.chainId, deps.contractAddress.toLowerCase(), holder],
    );
    throw err;
  }
}

async function release(deps: IndexerDeps, holder: string, block: number, logIndex: number): Promise<void> {
  await deps.db.query(
    `update indexer_checkpoints
        set last_processed_block=$3, last_processed_log_index=$4, leased_by=null, lease_expires_at=null,
            version=version+1, updated_at=now()
      where chain_id=$1 and contract_address=$2 and leased_by=$5`,
    [deps.chainId, deps.contractAddress.toLowerCase(), block, logIndex, holder],
  );
}

async function applyProjection(
  deps: IndexerDeps,
  eventType: string,
  sender: string,
  receiver: string,
  flowRateWei: bigint | undefined,
  eventId: string,
): Promise<void> {
  const status =
    eventType === 'flow_closed' || eventType === 'flow_deleted'
      ? 'closed'
      : eventType === 'flow_paused'
        ? 'paused'
        : 'active';
  await deps.db.query(
    `insert into flow_subscriptions (chain_id, contract_address, sender_wallet, receiver_wallet, flow_rate_wei_s,
        status, last_update_timestamp, last_event_id)
     values ($1,$2,$3,$4,$5,$6,now(),$7)
     on conflict (chain_id, contract_address, sender_wallet, receiver_wallet)
     do update set flow_rate_wei_s=excluded.flow_rate_wei_s, status=excluded.status,
                   last_update_timestamp=now(), last_event_id=excluded.last_event_id, updated_at=now()`,
    [
      deps.chainId,
      deps.contractAddress.toLowerCase(),
      sender.toLowerCase(),
      receiver.toLowerCase(),
      (flowRateWei ?? 0n).toString(),
      status,
      eventId,
    ],
  );
}
