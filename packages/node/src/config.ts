// Central config: env + on-chain ids + circuit artifact paths.
import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// packages/node/src -> packages/circuits/build
export const CIRCUITS_BUILD = resolve(here, "../../circuits/build");

export function circuitArtifacts(circuit: string) {
  return {
    wasm: resolve(CIRCUITS_BUILD, `${circuit}_js/${circuit}.wasm`),
    zkey: resolve(CIRCUITS_BUILD, `${circuit}.zkey`),
    vkey: resolve(CIRCUITS_BUILD, `${circuit}.vkey.json`),
  };
}

// circuit name -> on-chain circuit_id / vk_id (see circuits/SIGNALS.md)
export const CIRCUIT_ID: Record<string, number> = {
  consensus: 1,
  derivation: 2,
  predicate: 3,
};

export interface SoracleConfig {
  rpcUrl: string;
  networkPassphrase: string;
  registryId: string;
  verifierId: string;
  publisherSecret: string;
  adminSecret: string;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

export function loadConfig(): SoracleConfig {
  return {
    rpcUrl: env("SORACLE_RPC_URL", "https://soroban-testnet.stellar.org"),
    networkPassphrase: env(
      "SORACLE_NETWORK_PASSPHRASE",
      "Test SDF Network ; September 2015",
    ),
    registryId: env("SORACLE_REGISTRY_ID", ""),
    verifierId: env("SORACLE_VERIFIER_ID", ""),
    publisherSecret: env("SORACLE_PUBLISHER_SECRET", ""),
    adminSecret: env("SORACLE_ADMIN_SECRET", ""),
  };
}
