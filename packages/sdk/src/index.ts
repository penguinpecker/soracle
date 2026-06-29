// Soracle SDK — read proof-carrying feeds from the registry.
// Reads are simulate-only (no signing, no ledger write).
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

export interface FeedEntry {
  /** published value (i128). */
  value: bigint;
  /** Poseidon commitment to the exact input set (hex, 0x-prefixed). */
  inputsCommitment: string;
  timestamp: bigint;
  epoch: number;
  circuitId: number;
}

export interface SoracleClientOptions {
  rpcUrl?: string;
  networkPassphrase?: string;
  registryId: string;
}

const TESTNET = "Test SDF Network ; September 2015";

export class SoracleClient {
  private server: Server;
  private networkPassphrase: string;
  private registryId: string;

  constructor(opts: SoracleClientOptions) {
    const rpcUrl = opts.rpcUrl ?? "https://soroban-testnet.stellar.org";
    this.server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
    this.networkPassphrase = opts.networkPassphrase ?? TESTNET;
    this.registryId = opts.registryId;
  }

  /** Read the latest proven value for a feed (null if never published). */
  async readFeed(feedId: number): Promise<FeedEntry | null> {
    const raw = await this.simulate("read_feed", [nativeToScVal(feedId, { type: "u32" })]);
    if (raw == null) return null;
    return {
      value: BigInt(raw.value),
      inputsCommitment: toHex(raw.inputs_commitment),
      timestamp: BigInt(raw.timestamp),
      epoch: Number(raw.epoch),
      circuitId: Number(raw.circuit_id),
    };
  }

  private async simulate(method: string, args: any[]): Promise<any> {
    const probe = Keypair.random();
    const source = new Account(probe.publicKey(), "0");
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(this.registryId).call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!Api.isSimulationSuccess(sim)) {
      throw new Error(`simulation failed: ${JSON.stringify(sim)}`);
    }
    return sim.result?.retval ? scValToNative(sim.result.retval) : null;
  }
}

function toHex(bytes: Uint8Array | string): string {
  if (typeof bytes === "string") return bytes;
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
