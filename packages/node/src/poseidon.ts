// Poseidon commitment helper. Uses circomlibjs so the hash is byte-identical to
// the in-circuit circomlib Poseidon — otherwise inputs_commitment won't match
// and proofs fail. Lazily builds the hasher once.
import { buildPoseidon } from "circomlibjs";

let _poseidon: any;

async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/** Poseidon hash of field elements -> field element (bigint). */
export async function poseidon(values: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  return p.F.toObject(p(values));
}

/** Commitment over a value set plus a salt (matches lib/commitment.circom). */
export async function commit(values: bigint[], salt: bigint): Promise<bigint> {
  return poseidon([...values, salt]);
}
