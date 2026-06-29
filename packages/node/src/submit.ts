// Build + send the Soroban transactions that drive Soracle: contract init,
// vkey/feed registration (admin), and the publish path (publisher).
import { readFileSync } from "node:fs";
import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { CIRCUIT_ID, circuitArtifacts, loadConfig, type SoracleConfig } from "./config.js";
import { encodeProof, encodeVkey, feToBytes32, type SnarkProof, type SnarkVkey } from "./encoding.js";
import { invoke } from "./stellar.js";

const u32 = (x: number): xdr.ScVal => nativeToScVal(x, { type: "u32" });
const u64 = (x: number | bigint): xdr.ScVal => nativeToScVal(BigInt(x), { type: "u64" });
const i128 = (x: bigint): xdr.ScVal => nativeToScVal(x, { type: "i128" });
const bytes = (b: Uint8Array): xdr.ScVal => nativeToScVal(b, { type: "bytes" });
const addr = (g: string): xdr.ScVal => new Address(g).toScVal();

/** One-time: init verifier + registry and wire them together. */
export async function initContracts(cfg: SoracleConfig = loadConfig()): Promise<void> {
  const admin = Keypair.fromSecret(cfg.adminSecret).publicKey();
  const publisher = Keypair.fromSecret(cfg.publisherSecret).publicKey();

  await invoke(cfg.verifierId, "init", [addr(admin)], cfg.adminSecret, cfg);
  await invoke(
    cfg.registryId,
    "init",
    [addr(admin), addr(cfg.verifierId), addr(publisher)],
    cfg.adminSecret,
    cfg,
  );
}

/** Admin: register a circuit's verifying key on the verifier contract. */
export async function registerVkey(circuit: string, cfg: SoracleConfig = loadConfig()): Promise<void> {
  const { vkey } = circuitArtifacts(circuit);
  const vk: SnarkVkey = JSON.parse(readFileSync(vkey, "utf8"));
  const enc = encodeVkey(vk);
  const vkScVal = nativeToScVal({
    alpha: enc.alpha,
    beta: enc.beta,
    gamma: enc.gamma,
    delta: enc.delta,
    ic: enc.ic,
  });
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
  const proofScVal = nativeToScVal({ a: enc.a, b: enc.b, c: enc.c });
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
