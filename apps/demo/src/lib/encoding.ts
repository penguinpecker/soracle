// CAP-0074 encoding for the Soroban BN254 verifier — kept byte-for-byte in sync
// with packages/node/src/encoding.ts.
//   G1 = X(32) || Y(32)                  big-endian
//   G2 = X.c1 || X.c0 || Y.c1 || Y.c0    (c1 FIRST — snarkjs stores [c0,c1])
//   Fr = 32-byte big-endian
// The c1-first G2 swap is the #1 cause of "valid proof, verify=false". Keep it.

export function feToBytes32(dec: string | bigint): Uint8Array {
  let hex = BigInt(dec).toString(16);
  if (hex.length > 64) throw new Error("field element overflows 32 bytes");
  hex = hex.padStart(64, "0");
  return hexToBytes(hex);
}

function g1ToBytes(p: string[]): Uint8Array {
  return concat(feToBytes32(p[0]), feToBytes32(p[1]));
}

function g2ToBytes(p: string[][]): Uint8Array {
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

function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
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
