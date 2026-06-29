// Adapter = "provider template" for an oracle feed (the Reclaim-provider idea,
// but proof-carrying). Each adapter fetches its sources, normalizes, runs the
// mirrored f(), and returns a fully-built witness + the public value to publish.
import type { SnarkProof } from "../encoding.js";

export type CircuitName = "consensus" | "derivation" | "predicate";

export interface SourceSpec {
  name: string;
  url: string;
  /** jsonpath-ish extractor: raw JSON -> normalized bigint field value. */
  extract: (raw: any) => bigint;
}

/** Result of one adapter tick: enough to prove + publish, or null for no-update. */
export interface Tick {
  circuit: CircuitName;
  /** on-chain published value (i128, non-negative for the demo path). */
  value: bigint;
  /** Poseidon commitment to the exact input set. */
  inputsCommitment: bigint;
  /** static aux1 public signal stored at register_feed (n_sources / wallet hash). */
  aux1: bigint;
  /** the full circuit witness input object handed to snarkjs. */
  witness: Record<string, unknown>;
  /** timestamp (unix seconds) baked into the witness — published verbatim. */
  timestamp: number;
  /** epoch baked into the witness — published verbatim. */
  epoch: number;
  /** human-readable note for logs. */
  note: string;
}

export interface Adapter {
  /** human id, e.g. "sports:epl-1234". */
  feedId: string;
  /** on-chain u32 feed id (registry key). */
  feedNumericId: number;
  circuit: CircuitName;
  refreshSeconds: number;
  /** aux1 value to register the feed with (must equal Tick.aux1). */
  registerAux1(): Promise<bigint>;
  /** fetch -> aggregate -> witness. Returns null to skip (e.g. below quorum). */
  tick(epoch: number): Promise<Tick | null>;
}

/** Stable salt per feed (demo): deterministic so commitments are reproducible.
 *  In production, use a fresh random salt per tick and store it for audit. */
export const DEMO_SALT = 1234567890n;

export interface ProvenTick extends Tick {
  proof: SnarkProof;
  publicSignals: string[];
  timestamp: number;
  epoch: number;
}
