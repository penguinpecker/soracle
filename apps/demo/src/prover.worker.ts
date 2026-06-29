/// <reference lib="webworker" />
// Real Groth16 proving in the browser, off the main thread, for BOTH circuits:
//   consensus  (Quorum(3,2))   — sports / multi-source web2 feeds
//   derivation (Σ sell-buy-fee) — cross-chain PnL (web3) + reputation (web2)
// Artifacts load as Uint8Array (NOT URL strings — the process.browser polyfill
// makes snarkjs/fastfile treat strings as Node paths). poseidon-lite is
// byte-identical to the in-circuit circomlib Poseidon.
import { groth16 } from "snarkjs";
import { poseidon2, poseidon4, poseidon16 } from "poseidon-lite";

const DEMO_SALT = 1234567890n;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ART: Record<string, { wasm: string; zkey: string }> = {
  consensus: { wasm: "/circuits/consensus.wasm", zkey: "/circuits/consensus.zkey" },
  derivation: { wasm: "/circuits/derivation.wasm", zkey: "/circuits/derivation.zkey" },
  predicate: { wasm: "/circuits/predicate.wasm", zkey: "/circuits/predicate.zkey" },
};
const cache: Record<string, { wasm?: Uint8Array; zkey?: Uint8Array }> = {
  consensus: {},
  derivation: {},
  predicate: {},
};

function post(msg: any) {
  (self as unknown as Worker).postMessage(msg);
}
async function load(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
function mod(x: bigint): bigint {
  return ((x % FIELD) + FIELD) % FIELD;
}
function quorum(values: bigint[]): bigint | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v.toString(), (counts.get(v.toString()) ?? 0) + 1);
  let best: { v: bigint; c: number } | null = null;
  for (const [k, c] of counts) if (c >= 2 && (!best || c > best.c)) best = { v: BigInt(k), c };
  return best?.v ?? null;
}

self.onmessage = async (e: MessageEvent) => {
  const { circuit, payload, timestamp, epoch } = e.data as {
    circuit: "consensus" | "derivation" | "predicate";
    payload: any;
    timestamp: number;
    epoch: number;
  };
  try {
    let input: Record<string, unknown>;
    let result: bigint;
    let commitment: bigint;

    if (circuit === "consensus") {
      const vals = (payload.values as string[]).map((v) => BigInt(v));
      const q = quorum(vals);
      if (q === null) {
        post({ type: "error", message: "no quorum — at least 2 of 3 sources must agree" });
        return;
      }
      result = q;
      post({ type: "progress", stage: "Computing Poseidon commitment", pct: 40 });
      commitment = poseidon4([vals[0], vals[1], vals[2], DEMO_SALT]) as bigint;
      input = {
        feed_id: "1",
        n_sources: "3",
        result: result.toString(),
        inputs_commitment: commitment.toString(),
        timestamp: String(timestamp),
        epoch: String(epoch),
        values: vals.map((v) => v.toString()),
        salt: DEMO_SALT.toString(),
      };
    } else if (circuit === "derivation") {
      // pad to M=5 records
      const recs = (payload.records as { buy: string; sell: string; fee: string }[]).slice(0, 5);
      while (recs.length < 5) recs.push({ buy: "0", sell: "0", fee: "0" });
      const buy = recs.map((r) => BigInt(r.buy));
      const sell = recs.map((r) => BigInt(r.sell));
      const fee = recs.map((r) => BigInt(r.fee));
      const pnl = sell.reduce((a, s, i) => a + s - buy[i] - fee[i], 0n);
      result = mod(pnl);
      post({ type: "progress", stage: "Computing Poseidon commitment", pct: 40 });
      commitment = poseidon16([...buy, ...sell, ...fee, DEMO_SALT]) as bigint;
      input = {
        feed_id: String(payload.feedId ?? 2),
        wallet_id_hash: String(payload.subjectHash ?? "0"),
        result: result.toString(),
        inputs_commitment: commitment.toString(),
        timestamp: String(timestamp),
        epoch: String(epoch),
        buy: buy.map((v) => v.toString()),
        sell: sell.map((v) => v.toString()),
        fee: fee.map((v) => v.toString()),
        salt: DEMO_SALT.toString(),
      };
    } else {
      // predicate — confidential threshold (value stays private; only the bit is public)
      const value = BigInt(payload.value);
      const threshold = BigInt(payload.threshold);
      result = value > threshold ? 1n : 0n;
      post({ type: "progress", stage: "Computing Poseidon commitment", pct: 40 });
      commitment = poseidon2([value, DEMO_SALT]) as bigint;
      input = {
        feed_id: String(payload.feedId ?? 5),
        subject_hash: String(payload.subjectHash ?? "0"),
        predicate_id: String(payload.predicateId ?? 1),
        threshold: threshold.toString(),
        outcome_bit: result.toString(),
        value_commitment: commitment.toString(),
        timestamp: String(timestamp),
        value: value.toString(),
        salt: DEMO_SALT.toString(),
      };
    }

    post({ type: "progress", stage: "Loading circuit + proving key", pct: 12 });
    const c = cache[circuit];
    if (!c.wasm) c.wasm = await load(ART[circuit].wasm);
    if (!c.zkey) c.zkey = await load(ART[circuit].zkey);

    post({ type: "progress", stage: "Generating Groth16 proof", pct: 60 });
    const { proof, publicSignals } = await groth16.fullProve(input, c.wasm, c.zkey);

    post({ type: "progress", stage: "Proof ready", pct: 100 });
    post({ type: "done", result: result.toString(), commitment: commitment.toString(), proof, publicSignals });
  } catch (err) {
    post({ type: "error", message: (err as Error).message ?? String(err) });
  }
};
