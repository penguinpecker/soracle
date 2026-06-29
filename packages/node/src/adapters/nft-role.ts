// Breadth adapter — NFT / role ownership (derivation.circom).
// Proves how many tokens of a collection a wallet owns (>=1 ⇒ owns / has role).
// Reads chain state via Blockscout (authenticated input). Wired as a derivation
// feed so it runs through the same engine; the confidential ownership-bit
// version lives in predicate.circom.
import { commitRecords, realizedPnl, type Record as PnlRecord } from "../aggregate.js";
import { poseidon } from "../poseidon.js";
import { DEMO_SALT, type Adapter, type Tick } from "./types.js";

const M = 5;

export interface NftRoleConfig {
  feedId: string;
  feedNumericId: number;
  refreshSeconds: number;
  /** "blockscout" | "demo" */
  source: string;
  wallet: string;
  collection: string; // ERC-721 contract address
  blockscoutBase?: string;
  demoCount?: number;
}

async function ownerHash(wallet: string, collection: string): Promise<bigint> {
  return poseidon([BigInt(wallet.toLowerCase()), BigInt(collection.toLowerCase())]);
}

async function fetchCount(cfg: NftRoleConfig): Promise<bigint> {
  if (cfg.source === "demo") return BigInt(cfg.demoCount ?? 0);
  const base = cfg.blockscoutBase ?? "https://eth.blockscout.com";
  const url = `${base}/api/v2/addresses/${cfg.wallet}/nft/collections?type=ERC-721`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`blockscout ${res.status}`);
  const data: any = await res.json();
  const col = (data.items ?? []).find(
    (c: any) => (c.token?.address ?? "").toLowerCase() === cfg.collection.toLowerCase(),
  );
  return BigInt(Number(col?.amount ?? 0));
}

export function nftRoleAdapter(cfg: NftRoleConfig): Adapter {
  return {
    feedId: cfg.feedId,
    feedNumericId: cfg.feedNumericId,
    circuit: "derivation",
    refreshSeconds: cfg.refreshSeconds,
    async registerAux1() {
      return ownerHash(cfg.wallet, cfg.collection);
    },
    async tick(epoch: number): Promise<Tick | null> {
      let count: bigint;
      try {
        count = await fetchCount(cfg);
      } catch (e) {
        console.warn(`[${cfg.feedId}] nft fetch failed: ${(e as Error).message}`);
        return null;
      }
      const records: PnlRecord[] = [{ buy: 0n, sell: count, fee: 0n }];
      while (records.length < M) records.push({ buy: 0n, sell: 0n, fee: 0n });

      const value = realizedPnl(records); // == count
      const aux1 = await ownerHash(cfg.wallet, cfg.collection);
      const inputsCommitment = await commitRecords(records, DEMO_SALT);
      const timestamp = Math.floor(Date.now() / 1000);
      const witness = {
        feed_id: BigInt(cfg.feedNumericId).toString(),
        wallet_id_hash: aux1.toString(),
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
        aux1,
        witness,
        timestamp,
        epoch,
        note: `owns ${value} of ${cfg.collection}`,
      };
    },
  };
}
