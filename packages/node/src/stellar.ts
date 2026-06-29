// Thin Soroban tx helpers over @stellar/stellar-sdk v16. Low-level path (no
// generated bindings) so the repo has zero codegen dependency.
import {
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { loadConfig, type SoracleConfig } from "./config.js";

export function makeServer(cfg: SoracleConfig = loadConfig()): Server {
  return new Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith("http://") });
}

/** Invoke a state-changing contract method and wait for success. */
export async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerSecret: string,
  cfg: SoracleConfig = loadConfig(),
): Promise<unknown> {
  const server = makeServer(cfg);
  const kp = Keypair.fromSecret(signerSecret);
  const source = await server.getAccount(kp.publicKey());
  const contract = new Contract(contractId);

  let tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  // prepareTransaction = simulate + assemble (footprint, fees, auth)
  tx = await server.prepareTransaction(tx);
  tx.sign(kp);

  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`sendTransaction failed: ${JSON.stringify(sent.errorResult)}`);
  }
  const res = await server.pollTransaction(sent.hash, {
    attempts: 20,
    sleepStrategy: () => 1500,
  });
  if (res.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`tx ${sent.hash} ${res.status}`);
  }
  return res.returnValue ? scValToNative(res.returnValue) : null;
}

// Note: read-only feed reads live in @soracle/sdk (SoracleClient.readFeed).
