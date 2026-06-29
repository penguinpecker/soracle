// Browser-side Soroban helpers: read proven feeds, and demonstrate on-chain
// tamper rejection via a read-only simulation (no keys, no ledger write).
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

export const CFG = {
  rpcUrl: (import.meta.env.VITE_SORACLE_RPC_URL as string) ?? "https://soroban-testnet.stellar.org",
  networkPassphrase:
    (import.meta.env.VITE_SORACLE_NETWORK_PASSPHRASE as string) ??
    "Test SDF Network ; September 2015",
  registryId: (import.meta.env.VITE_SORACLE_REGISTRY_ID as string) ?? "",
};

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

function buildCall(method: string, args: any[]) {
  const probe = Keypair.random();
  const source = new Account(probe.publicKey(), "0");
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: CFG.networkPassphrase,
  })
    .addOperation(new Contract(CFG.registryId).call(method, ...args))
    .setTimeout(30)
    .build();
}

export async function readFeed(feedId: number): Promise<FeedEntry | null> {
  const sim = await server().simulateTransaction(
    buildCall("read_feed", [nativeToScVal(feedId, { type: "u32" })]),
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

/**
 * Try to publish a SPOOFED value with a bogus proof. We only simulate, so no
 * keys are needed — the registry still runs the verifier's pairing check and
 * the simulation surfaces the on-chain rejection. This is the live
 * "tampered value is rejected on-chain" demonstration (DoD #1).
 */
export async function simulateTamper(feedId: number, spoofedValue: bigint): Promise<{ rejected: boolean; detail: string }> {
  // Use strictly-fresh timestamp/epoch (past any stored value) so the publish
  // clears the freshness checks and actually reaches the verifier, and force
  // SYMBOL struct keys so the Proof arg decodes (bare nativeToScVal => string keys).
  const prev = await readFeed(feedId);
  const now = Math.floor(Date.now() / 1000);
  const ts = prev ? Math.max(now, Number(prev.timestamp) + 1) : now;
  const epoch = prev ? Math.max(now, prev.epoch + 1) : now;
  const bogusProof = nativeToScVal(
    { a: new Uint8Array(64), b: new Uint8Array(128), c: new Uint8Array(64) },
    { type: { a: ["symbol", "bytes"], b: ["symbol", "bytes"], c: ["symbol", "bytes"] } },
  );
  const args = [
    nativeToScVal(feedId, { type: "u32" }),
    nativeToScVal(spoofedValue, { type: "i128" }),
    nativeToScVal(new Uint8Array(32), { type: "bytes" }),
    nativeToScVal(BigInt(ts), { type: "u64" }),
    nativeToScVal(epoch, { type: "u32" }),
    bogusProof,
  ];
  const sim = await server().simulateTransaction(buildCall("publish", args));
  if (!Api.isSimulationSuccess(sim)) {
    // the verifier's pairing check failed / contract panicked -> bad value rejected
    return { rejected: true, detail: (sim as any).error ?? JSON.stringify(sim) };
  }
  return { rejected: false, detail: "simulation unexpectedly succeeded" };
}

function toHex(bytes: Uint8Array | string): string {
  if (typeof bytes === "string") return bytes;
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
