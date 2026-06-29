// Browser-side Soroban helpers: read proven feeds, verify a browser-generated
// proof on-chain (read-only simulate, no keys), and demonstrate tamper rejection.
import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { encodeProof, feToBytes32, type SnarkProof } from "./lib/encoding.ts";

export const CFG = {
  rpcUrl: (import.meta.env.VITE_SORACLE_RPC_URL as string) ?? "https://soroban-testnet.stellar.org",
  networkPassphrase:
    (import.meta.env.VITE_SORACLE_NETWORK_PASSPHRASE as string) ??
    "Test SDF Network ; September 2015",
  registryId: (import.meta.env.VITE_SORACLE_REGISTRY_ID as string) ?? "",
  verifierId: (import.meta.env.VITE_SORACLE_VERIFIER_ID as string) ?? "",
};

/** consensus circuit's vk_id on the verifier (see SIGNALS.md). */
export const CONSENSUS_VK_ID = 1;

export interface FeedEntry {
  value: bigint;
  inputsCommitment: string;
  timestamp: bigint;
  epoch: number;
  circuitId: number;
}

function server(): Server {
  return new Server(CFG.rpcUrl, { allowHttp: CFG.rpcUrl.startsWith("http://") });
}

function buildCall(contractId: string, method: string, args: any[]) {
  const probe = Keypair.random();
  const source = new Account(probe.publicKey(), "0");
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: CFG.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
}

export async function readFeed(feedId: number): Promise<FeedEntry | null> {
  const sim = await server().simulateTransaction(
    buildCall(CFG.registryId, "read_feed", [nativeToScVal(feedId, { type: "u32" })]),
  );
  if (!Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  const raw: any = scValToNative(sim.result.retval);
  if (raw == null) return null;
  return {
    value: BigInt(raw.value),
    inputsCommitment: toHex(raw.inputs_commitment),
    timestamp: BigInt(raw.timestamp),
    epoch: Number(raw.epoch),
    circuitId: Number(raw.circuit_id),
  };
}

/** Soroban struct ScVal {a,b,c} with SYMBOL keys (bare nativeToScVal makes string keys). */
function proofScVal(proof: SnarkProof) {
  const enc = encodeProof(proof);
  return nativeToScVal(
    { a: enc.a, b: enc.b, c: enc.c },
    { type: { a: ["symbol", "bytes"], b: ["symbol", "bytes"], c: ["symbol", "bytes"] } },
  );
}

/** Vec<BytesN<32>> from snarkjs decimal-string public signals. */
function publicInputsScVal(publicSignals: string[]) {
  return nativeToScVal(publicSignals.map((s) => feToBytes32(s)));
}

/**
 * Verify a browser-generated proof ON-CHAIN, read-only (no wallet/keys). Calls
 * the verifier's `verify(vk_id, proof, public_inputs) -> bool` via simulate.
 * Returns the real boolean the BN254 pairing_check produced.
 */
export async function verifyOnChain(
  proof: SnarkProof,
  publicSignals: string[],
  vkId = CONSENSUS_VK_ID,
): Promise<boolean> {
  const sim = await server().simulateTransaction(
    buildCall(CFG.verifierId, "verify", [
      nativeToScVal(vkId, { type: "u32" }),
      proofScVal(proof),
      publicInputsScVal(publicSignals),
    ]),
  );
  if (!Api.isSimulationSuccess(sim) || !sim.result?.retval) return false;
  return scValToNative(sim.result.retval) === true;
}

/**
 * Try to publish a spoofed value with a bogus proof (read-only simulate). The
 * registry runs the verifier's pairing_check, so the chain rejects it — no keys
 * needed. Returns the on-chain rejection detail.
 */
export async function simulateTamper(
  feedId: number,
  spoofedValue: bigint,
): Promise<{ rejected: boolean; detail: string }> {
  const prev = await readFeed(feedId);
  const now = Math.floor(Date.now() / 1000);
  const ts = prev ? Math.max(now, Number(prev.timestamp) + 1) : now;
  const epoch = prev ? Math.max(now, prev.epoch + 1) : now;
  const bogusProof = nativeToScVal(
    { a: new Uint8Array(64), b: new Uint8Array(128), c: new Uint8Array(64) },
    { type: { a: ["symbol", "bytes"], b: ["symbol", "bytes"], c: ["symbol", "bytes"] } },
  );
  const sim = await server().simulateTransaction(
    buildCall(CFG.registryId, "publish", [
      nativeToScVal(feedId, { type: "u32" }),
      nativeToScVal(spoofedValue, { type: "i128" }),
      nativeToScVal(new Uint8Array(32), { type: "bytes" }),
      nativeToScVal(BigInt(ts), { type: "u64" }),
      nativeToScVal(epoch, { type: "u32" }),
      bogusProof,
    ]),
  );
  if (!Api.isSimulationSuccess(sim)) {
    return { rejected: true, detail: (sim as any).error ?? JSON.stringify(sim) };
  }
  return { rejected: false, detail: "simulation unexpectedly succeeded" };
}

function toHex(bytes: Uint8Array | string): string {
  if (typeof bytes === "string") return bytes;
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
