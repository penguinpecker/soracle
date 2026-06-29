// f() implementations — MUST mirror the circuits 1:1 (brief §5 "Mirror rule").
// A divergence here means the node builds a witness the circuit rejects, or
// publishes a value the proof doesn't actually attest. test/mirror.test.ts pins
// these against the compiled circuits.
import { commit, poseidon } from "./poseidon.js";

/** BN254 scalar field order (snarkjs bn128 = alt_bn254). */
export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Reduce a possibly-negative integer into the field (matches circom wrapping). */
export function toField(x: bigint): bigint {
  const m = x % FIELD;
  return m < 0n ? m + FIELD : m;
}

// --- consensus.circom: quorum over discrete values ---
export interface ConsensusResult {
  result: bigint;
  quorum: number;
}

/**
 * Returns the value that at least `k` of the sources agree on (the modal value
 * if its count >= k), else null (no-update — sources disagree below quorum).
 * Mirrors Quorum(N, K): "at least K of N values equal result".
 */
export function consensus(values: bigint[], k: number): ConsensusResult | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { result: bigint; quorum: number } | null = null;
  for (const [key, count] of counts) {
    if (count >= k && (!best || count > best.quorum)) {
      best = { result: BigInt(key), quorum: count };
    }
  }
  return best;
}

// --- derivation.circom: realized PnL = Σ(sell - buy - fee) ---
export interface Record {
  buy: bigint;
  sell: bigint;
  fee: bigint;
}

export function realizedPnl(records: Record[]): bigint {
  let pnl = 0n;
  for (const r of records) pnl += r.sell - r.buy - r.fee;
  return pnl; // caller keeps it non-negative for the on-chain i128 path
}

// --- predicate.circom: outcome_bit = value > threshold ---
export function predicateBit(value: bigint, threshold: bigint): bigint {
  return value > threshold ? 1n : 0n;
}

// --- commitments (exposed so adapters build the witness consistently) ---

/** consensus / generic value-set commitment: Poseidon(values.., salt). */
export async function commitValues(values: bigint[], salt: bigint): Promise<bigint> {
  return commit(values, salt);
}

/** derivation commitment over flattened (buy.., sell.., fee.., salt). */
export async function commitRecords(records: Record[], salt: bigint): Promise<bigint> {
  const buy = records.map((r) => r.buy);
  const sell = records.map((r) => r.sell);
  const fee = records.map((r) => r.fee);
  return commit([...buy, ...sell, ...fee], salt);
}

/** predicate commitment: Poseidon(value, salt). */
export async function commitValue(value: bigint, salt: bigint): Promise<bigint> {
  return poseidon([value, salt]);
}
