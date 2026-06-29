// Encode snarkjs proof / vkey JSON into the exact byte layout the Soroban BN254
// verifier expects (CAP-0074). MUST stay in sync with the contract decoders and
// with circuits/scripts/vkey-to-soroban.mjs.
//
//   G1 = X(32) || Y(32)                  big-endian, uncompressed -> 64 bytes
//   G2 = X.c1 || X.c0 || Y.c1 || Y.c0    (c1 FIRST — snarkjs stores [c0,c1])
//   Fr = 32-byte big-endian
//
// The c1-first swap on G2 points is the single most common cause of
// "valid proof, verify returns false". Do not remove it.

const FIELD = "0x";

/** decimal string field element -> 32-byte big-endian Uint8Array */
export function feToBytes32(dec: string | bigint): Uint8Array {
  let hex = BigInt(dec).toString(16);
  if (hex.length > 64) throw new Error("field element overflows 32 bytes");
  hex = hex.padStart(64, "0");
  return hexToBytes(hex);
}

/** snarkjs G1 [x, y, z] -> 64 bytes (drop projective z) */
export function g1ToBytes(p: string[]): Uint8Array {
  return concat(feToBytes32(p[0]), feToBytes32(p[1]));
}

/** snarkjs G2 [[xc0,xc1],[yc0,yc1],[z..]] -> 128 bytes with c1 FIRST */
export function g2ToBytes(p: string[][]): Uint8Array {
  return concat(
    feToBytes32(p[0][1]), // X.c1
    feToBytes32(p[0][0]), // X.c0
    feToBytes32(p[1][1]), // Y.c1
    feToBytes32(p[1][0]), // Y.c0
  );
}

export interface SnarkProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  curve: string;
}

export interface EncodedProof {
  a: Uint8Array; // 64
  b: Uint8Array; // 128
  c: Uint8Array; // 64
}

export function encodeProof(proof: SnarkProof): EncodedProof {
  if (proof.curve !== "bn128") throw new Error(`unexpected curve ${proof.curve}`);
  return {
    a: g1ToBytes(proof.pi_a),
    b: g2ToBytes(proof.pi_b),
    c: g1ToBytes(proof.pi_c),
  };
}

export interface SnarkVkey {
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
}

export interface EncodedVkey {
  alpha: Uint8Array; // 64
  beta: Uint8Array; // 128
  gamma: Uint8Array; // 128
  delta: Uint8Array; // 128
  ic: Uint8Array[]; // each 64
}

export function encodeVkey(vk: SnarkVkey): EncodedVkey {
  if (vk.curve !== "bn128") throw new Error(`unexpected curve ${vk.curve}`);
  return {
    alpha: g1ToBytes(vk.vk_alpha_1),
    beta: g2ToBytes(vk.vk_beta_2),
    gamma: g2ToBytes(vk.vk_gamma_2),
    delta: g2ToBytes(vk.vk_delta_2),
    ic: vk.IC.map(g1ToBytes),
  };
}

// --- small hex/byte helpers (no deps) ---
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith(FIELD)) hex = hex.slice(2);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
