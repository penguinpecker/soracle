// Breadth adapter — GitHub developer reputation (derivation.circom).
// Proven reputation score derived from the public GitHub API. Modeled as a
// derivation feed (result = Σ records) so it flows through the same engine as
// the hero feeds. (A confidential "contributions > N" predicate is available at
// the circuit level via predicate.circom; that path needs a registry publish
// variant for the 7-signal layout — see SIGNALS.md.)
import { commitRecords, realizedPnl, type Record as PnlRecord } from "../aggregate.js";
import { poseidon } from "../poseidon.js";
import { DEMO_SALT, type Adapter, type Tick } from "./types.js";

const M = 5;

export interface GithubConfig {
  feedId: string;
  feedNumericId: number;
  refreshSeconds: number;
  user: string;
  /** "live" | "demo" */
  source?: string;
  demoScore?: number;
}

async function userHash(user: string): Promise<bigint> {
  // hash the lowercased username bytes into a field element
  let acc = 0n;
  for (const ch of user.toLowerCase()) acc = (acc << 8n) + BigInt(ch.charCodeAt(0));
  return poseidon([acc]);
}

async function fetchReputation(cfg: GithubConfig): Promise<bigint> {
  if (cfg.source === "demo") return BigInt(cfg.demoScore ?? 0);
  const res = await fetch(`https://api.github.com/users/${cfg.user}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "soracle" },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const u: any = await res.json();
  // simple public reputation proxy: followers + public_repos
  return BigInt(Number(u.followers ?? 0) + Number(u.public_repos ?? 0));
}

export function githubAdapter(cfg: GithubConfig): Adapter {
  return {
    feedId: cfg.feedId,
    feedNumericId: cfg.feedNumericId,
    circuit: "derivation",
    refreshSeconds: cfg.refreshSeconds,
    async registerAux1() {
      return userHash(cfg.user);
    },
    async tick(epoch: number): Promise<Tick | null> {
      let reputation: bigint;
      try {
        reputation = await fetchReputation(cfg);
      } catch (e) {
        console.warn(`[${cfg.feedId}] github fetch failed: ${(e as Error).message}`);
        return null;
      }
      const records: PnlRecord[] = [{ buy: 0n, sell: reputation, fee: 0n }];
      while (records.length < M) records.push({ buy: 0n, sell: 0n, fee: 0n });

      const value = realizedPnl(records); // == reputation
      const wallet_id_hash = await userHash(cfg.user);
      const inputsCommitment = await commitRecords(records, DEMO_SALT);
      const timestamp = Math.floor(Date.now() / 1000);
      const witness = {
        feed_id: BigInt(cfg.feedNumericId).toString(),
        wallet_id_hash: wallet_id_hash.toString(),
        result: value.toString(),
        inputs_commitment: inputsCommitment.toString(),
        timestamp: BigInt(timestamp).toString(),
        epoch: BigInt(epoch).toString(),
        buy: records.map((r) => r.buy.toString()),
        sell: records.map((r) => r.sell.toString()),
        fee: records.map((r) => r.fee.toString()),
        salt: DEMO_SALT.toString(),
      };
      return {
        circuit: "derivation",
        value,
        inputsCommitment,
        aux1: wallet_id_hash,
        witness,
        timestamp,
        epoch,
        note: `github reputation ${value} for ${cfg.user}`,
      };
    },
  };
}
