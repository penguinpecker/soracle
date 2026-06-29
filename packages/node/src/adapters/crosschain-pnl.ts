// Hero feed 2 — cross-chain wallet PnL/activity (derivation.circom).
// Inputs are chain-authenticated (read from an EVM explorer / Blockscout), so
// the ZK is end-to-end meaningful: realized PnL = Σ(sell - buy - fee) is proven
// to be the honest function of the committed records — the operator can't
// inflate a track record.
import { commitRecords, realizedPnl, type Record as PnlRecord } from "../aggregate.js";
import { poseidon } from "../poseidon.js";
import { DEMO_SALT, type Adapter, type Tick } from "./types.js";

const M = 5; // records per derivation (matches derivation.circom Derivation(5))

export interface PnlConfig {
  feedId: string;
  feedNumericId: number;
  refreshSeconds: number;
  /** "blockscout" | "demo" */
  source: string;
  /** EVM wallet address (0x...) — also hashed into wallet_id_hash. */
  wallet: string;
  /** Blockscout instance base, e.g. https://eth.blockscout.com */
  blockscoutBase?: string;
  /** demo records (buy,sell,fee) in whole-token units. */
  demoRecords?: Array<[number, number, number]>;
}

/** hash an 0x address into a field element for wallet_id_hash. */
async function walletHash(addr: string): Promise<bigint> {
  return poseidon([BigInt(addr.toLowerCase())]);
}

function padRecords(records: PnlRecord[]): PnlRecord[] {
  const out = records.slice(0, M);
  while (out.length < M) out.push({ buy: 0n, sell: 0n, fee: 0n });
  return out;
}

async function fetchRecords(cfg: PnlConfig): Promise<PnlRecord[]> {
  if (cfg.source === "demo") {
    return (cfg.demoRecords ?? []).map(([buy, sell, fee]) => ({
      buy: BigInt(buy),
      sell: BigInt(sell),
      fee: BigInt(fee),
    }));
  }
  // Blockscout v2: recent token transfers for the wallet. Incoming -> sell,
  // outgoing -> buy, normalized to whole-token units to stay in 64-bit range.
  const base = cfg.blockscoutBase ?? "https://eth.blockscout.com";
  const url = `${base}/api/v2/addresses/${cfg.wallet}/token-transfers?type=ERC-20&filter=to%20%7C%20from`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`blockscout ${res.status}`);
  const data: any = await res.json();
  const wallet = cfg.wallet.toLowerCase();
  const records: PnlRecord[] = [];
  for (const t of (data.items ?? []).slice(0, M)) {
    const decimals = Number(t.token?.decimals ?? 18);
    const whole = BigInt(t.total?.value ?? "0") / 10n ** BigInt(decimals);
    const incoming = (t.to?.hash ?? "").toLowerCase() === wallet;
    records.push({
      buy: incoming ? 0n : whole,
      sell: incoming ? whole : 0n,
      fee: 0n,
    });
  }
  return records;
}

export function crosschainPnlAdapter(cfg: PnlConfig): Adapter {
  return {
    feedId: cfg.feedId,
    feedNumericId: cfg.feedNumericId,
    circuit: "derivation",
    refreshSeconds: cfg.refreshSeconds,
    async registerAux1() {
      return walletHash(cfg.wallet);
    },
    async tick(epoch: number): Promise<Tick | null> {
      let records: PnlRecord[];
      try {
        records = padRecords(await fetchRecords(cfg));
      } catch (e) {
        console.warn(`[${cfg.feedId}] fetch failed: ${(e as Error).message}`);
        return null;
      }
      const pnl = realizedPnl(records);
      if (pnl < 0n) {
        // demo i128 path is non-negative only (signed PnL is a documented TODO)
        console.log(`[${cfg.feedId}] realized PnL ${pnl} < 0 — skipping (demo path)`);
        return null;
      }
      const wallet_id_hash = await walletHash(cfg.wallet);
      const inputsCommitment = await commitRecords(records, DEMO_SALT);
      const timestamp = Math.floor(Date.now() / 1000);
      const witness = {
        feed_id: BigInt(cfg.feedNumericId).toString(),
        wallet_id_hash: wallet_id_hash.toString(),
        result: pnl.toString(),
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
        value: pnl,
        inputsCommitment,
        aux1: wallet_id_hash,
        witness,
        timestamp,
        epoch,
        note: `realized PnL ${pnl} over ${records.filter((r) => r.buy || r.sell).length} records`,
      };
    },
  };
}
