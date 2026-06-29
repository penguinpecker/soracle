/// <reference lib="webworker" />
// Real Groth16 proving in the browser, off the main thread.
// Loads the consensus circuit artifacts as Uint8Array (NOT URL strings — the
// process.browser polyfill makes snarkjs/fastfile treat strings as Node paths),
// computes the Poseidon commitment with poseidon-lite (byte-identical to the
// in-circuit circomlib Poseidon), and proves Consensus(3,2).
import { groth16 } from "snarkjs";
import { poseidon4 } from "poseidon-lite";

const DEMO_SALT = 1234567890n;
const WASM_URL = "/circuits/consensus.wasm";
const ZKEY_URL = "/circuits/consensus.zkey";

let wasm: Uint8Array | null = null;
let zkey: Uint8Array | null = null;

type Progress = { type: "progress"; stage: string; pct: number };
type Done = {
  type: "done";
  result: string; // decimal
  commitment: string; // decimal
  proof: unknown;
  publicSignals: string[];
};
type Err = { type: "error"; message: string };

function post(msg: Progress | Done | Err) {
  (self as unknown as Worker).postMessage(msg);
}

async function load(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** value reported by >= 2 of 3 sources (Quorum(3,2)); null if no quorum. */
function quorum(values: bigint[]): bigint | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v.toString(), (counts.get(v.toString()) ?? 0) + 1);
  let best: { v: bigint; c: number } | null = null;
  for (const [k, c] of counts) if (c >= 2 && (!best || c > best.c)) best = { v: BigInt(k), c };
  return best?.v ?? null;
}

self.onmessage = async (e: MessageEvent) => {
  const { values, timestamp, epoch } = e.data as {
    values: string[];
    timestamp: number;
    epoch: number;
  };
  try {
    const vals = values.map((v) => BigInt(v));
    const result = quorum(vals);
    if (result === null) {
      post({ type: "error", message: "no quorum: at least 2 of 3 sources must agree — cannot prove" });
      return;
    }

    post({ type: "progress", stage: "Loading circuit + proving key", pct: 8 });
    if (!wasm) wasm = await load(WASM_URL);
    post({ type: "progress", stage: "Loading circuit + proving key", pct: 30 });
    if (!zkey) zkey = await load(ZKEY_URL);

    post({ type: "progress", stage: "Computing Poseidon commitment", pct: 42 });
    const commitment = poseidon4([vals[0], vals[1], vals[2], DEMO_SALT]) as bigint;

    post({ type: "progress", stage: "Generating Groth16 proof", pct: 55 });
    const input = {
      feed_id: "1",
      n_sources: "3",
      result: result.toString(),
      inputs_commitment: commitment.toString(),
      timestamp: String(timestamp),
      epoch: String(epoch),
      values: vals.map((v) => v.toString()),
      salt: DEMO_SALT.toString(),
    };
    const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);

    post({ type: "progress", stage: "Proof ready", pct: 100 });
    post({
      type: "done",
      result: result.toString(),
      commitment: commitment.toString(),
      proof,
      publicSignals,
    });
  } catch (err) {
    post({ type: "error", message: (err as Error).message ?? String(err) });
  }
};
