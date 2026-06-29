// Per-feed refresh loop: tick -> prove -> publish. Robust logging + backoff;
// never publishes when the adapter returns null (e.g. below quorum).
import { readFileSync } from "node:fs";
import type { Adapter } from "./adapters/index.js";
import { circuitArtifacts, loadConfig } from "./config.js";
import { prove, verifyLocal } from "./prover.js";
import { publishFeed } from "./submit.js";

export interface RunOnceResult {
  feedId: string;
  published: boolean;
  value?: bigint;
  note: string;
  txError?: string;
}

/** Run a single fetch->prove->publish cycle for one adapter. */
export async function runOnce(adapter: Adapter, epoch: number): Promise<RunOnceResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const tick = await adapter.tick(epoch ?? timestamp);
  if (!tick) {
    return { feedId: adapter.feedId, published: false, note: "no-update" };
  }

  // prove
  const { proof, publicSignals } = await prove(tick.circuit, tick.witness);

  // local sanity check before paying for a tx
  const { vkey } = circuitArtifacts(tick.circuit);
  const vk = JSON.parse(readFileSync(vkey, "utf8"));
  const okLocal = await verifyLocal(vk, publicSignals, proof);
  if (!okLocal) {
    return { feedId: adapter.feedId, published: false, note: "local verify failed (witness/circuit mismatch)" };
  }

  // publish (registry verifies on-chain before storing)
  try {
    await publishFeed({
      feedId: adapter.feedNumericId,
      value: tick.value,
      inputsCommitment: tick.inputsCommitment,
      timestamp: tick.timestamp,
      epoch: tick.epoch,
      proof,
    });
    return { feedId: adapter.feedId, published: true, value: tick.value, note: tick.note };
  } catch (e) {
    return { feedId: adapter.feedId, published: false, note: tick.note, txError: (e as Error).message };
  }
}

/** Start the scheduler: each adapter runs on its own interval until stopped. */
export function startScheduler(adapters: Adapter[]): () => void {
  loadConfig(); // fail fast if env missing
  const timers: NodeJS.Timeout[] = [];

  for (const adapter of adapters) {
    let epoch = Math.floor(Date.now() / 1000);
    const run = async () => {
      epoch = Math.max(epoch + 1, Math.floor(Date.now() / 1000)); // strictly increasing
      try {
        const r = await runOnce(adapter, epoch);
        if (r.published) {
          console.log(`✓ ${r.feedId} published value=${r.value} (${r.note})`);
        } else if (r.txError) {
          console.error(`✗ ${r.feedId} publish failed: ${r.txError}`);
        } else {
          console.log(`· ${r.feedId} ${r.note}`);
        }
      } catch (e) {
        console.error(`✗ ${adapter.feedId} error: ${(e as Error).message}`);
      }
    };
    void run();
    timers.push(setInterval(run, adapter.refreshSeconds * 1000));
    console.log(`▶ scheduled ${adapter.feedId} every ${adapter.refreshSeconds}s`);
  }

  return () => timers.forEach(clearInterval);
}
