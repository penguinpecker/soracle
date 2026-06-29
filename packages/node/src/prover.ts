// snarkjs Groth16 prover wrapper. Produces a proof + public signals for a
// circuit given a fully-populated witness input object.
import { groth16 } from "snarkjs";
import { existsSync } from "node:fs";
import { circuitArtifacts } from "./config.js";
import type { SnarkProof } from "./encoding.js";

export interface ProveResult {
  proof: SnarkProof;
  publicSignals: string[];
}

export async function prove(
  circuit: string,
  input: Record<string, unknown>,
): Promise<ProveResult> {
  const { wasm, zkey } = circuitArtifacts(circuit);
  if (!existsSync(wasm) || !existsSync(zkey)) {
    throw new Error(
      `missing circuit artifacts for "${circuit}" (${wasm}). Run \`npm run build\` in packages/circuits first.`,
    );
  }
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
  return { proof: proof as SnarkProof, publicSignals };
}

/** Local sanity check (mirrors snarkjs groth16 verify) before submitting. */
export async function verifyLocal(
  vkey: object,
  publicSignals: string[],
  proof: SnarkProof,
): Promise<boolean> {
  return groth16.verify(vkey, publicSignals, proof as any);
}
