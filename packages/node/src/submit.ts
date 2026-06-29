// Build + send the Soroban transactions that drive Soracle: contract init,
// vkey/feed registration (admin), and the publish path (publisher).
import { readFileSync } from "node:fs";
import { nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { CIRCUIT_ID, circuitArtifacts, loadConfig, type SoracleConfig } from "./config.js";
import { encodeProof, encodeVkey, feToBytes32, type SnarkProof, type SnarkVkey } from "./encoding.js";
import { invoke } from "./stellar.js";

const u32 = (x: number): xdr.ScVal => nativeToScVal(x, { type: "u32" });
const u64 = (x: number | bigint): xdr.ScVal => nativeToScVal(BigInt(x), { type: "u64" });
const i128 = (x: bigint): xdr.ScVal => nativeToScVal(x, { type: "i128" });
const bytes = (b: Uint8Array): xdr.ScVal => nativeToScVal(b, { type: "bytes" });

// Admin/verifier/publisher are bound atomically by each contract's
// __constructor at deploy time (see deploy.sh) — no separate init step.

/** Admin: register a circuit's verifying key on the verifier contract. */
export async function registerVkey(circuit: string, cfg: SoracleConfig = loadConfig()): Promise<void> {
  const { vkey } = circuitArtifacts(circuit);
  const vk: SnarkVkey = JSON.parse(readFileSync(vkey, "utf8"));
  const enc = encodeVkey(vk);
  // Soroban #[contracttype] structs are ScMaps keyed by SYMBOL. A bare
  // nativeToScVal(obj) produces STRING keys, which fail to decode into the
  // VerifyingKey struct — so the key type must be forced to 'symbol'. (ic is an
  // array; the 'bytes' value type is applied per-element -> scvVec<scvBytes>.)
  const vkScVal = nativeToScVal(
    { alpha: enc.alpha, beta: enc.beta, gamma: enc.gamma, delta: enc.delta, ic: enc.ic },
    {
      type: {
        alpha: ["symbol", "bytes"],
        beta: ["symbol", "bytes"],
        gamma: ["symbol", "bytes"],
        delta: ["symbol", "bytes"],
        ic: ["symbol", "bytes"],
      },
    },
  );
  await invoke(
    cfg.verifierId,
    "register_vkey",
    [u32(CIRCUIT_ID[circuit]), vkScVal],
    cfg.adminSecret,
    cfg,
  );
}

/** Admin: register a feed (circuit + static aux1 public signal). */
export async function registerFeed(
  feedId: number,
  circuit: string,
  aux1: bigint,
  cfg: SoracleConfig = loadConfig(),
): Promise<void> {
  await invoke(
    cfg.registryId,
    "register_feed",
    [u32(feedId), u32(CIRCUIT_ID[circuit]), bytes(feToBytes32(aux1))],
    cfg.adminSecret,
    cfg,
  );
}

export interface PublishParams {
  feedId: number;
  value: bigint;
  inputsCommitment: bigint;
  timestamp: number;
  epoch: number;
  proof: SnarkProof;
}

/** Publisher: submit a proven feed value. The registry verifies before storing. */
export async function publishFeed(p: PublishParams, cfg: SoracleConfig = loadConfig()): Promise<void> {
  const enc = encodeProof(p.proof);
  // SYMBOL keys (see registerVkey) — bare nativeToScVal makes STRING keys that
  // won't decode into the Proof struct.
  const proofScVal = nativeToScVal(
    { a: enc.a, b: enc.b, c: enc.c },
    { type: { a: ["symbol", "bytes"], b: ["symbol", "bytes"], c: ["symbol", "bytes"] } },
  );
  await invoke(
    cfg.registryId,
    "publish",
    [
      u32(p.feedId),
      i128(p.value),
      bytes(feToBytes32(p.inputsCommitment)),
      u64(p.timestamp),
      u32(p.epoch),
      proofScVal,
    ],
    cfg.publisherSecret,
    cfg,
  );
}
