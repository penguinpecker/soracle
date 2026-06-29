// Convert a snarkjs verification_key.json into the byte layout the Soroban
// BN254 verifier expects, and emit it as hex so the node/CLI can register it.
//
// CRITICAL (CAP-0074): snarkjs stores Fp2 as [c0, c1] (real first) but the host
// wants c1 (imaginary) FIRST. So every G2 point is serialized as
//   X.c1 || X.c0 || Y.c1 || Y.c0   (32 bytes each, big-endian)  -> 128 bytes
// G1 points are X || Y (32 each, big-endian) -> 64 bytes, NO swap.
// This same encoding lives in node/src/encoding.ts for proofs — keep them in sync.
//
// Usage: node scripts/vkey-to-soroban.mjs consensus
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const c = process.argv[2] || "consensus";
const BUILD = resolve(here, "../build");

const toBE32 = (dec) => {
  let h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error("field element overflows 32 bytes");
  return h.padStart(64, "0");
};
const g1 = (p) => toBE32(p[0]) + toBE32(p[1]);                 // X || Y
const g2 = (p) =>
  toBE32(p[0][1]) + toBE32(p[0][0]) +                          // X.c1 || X.c0
  toBE32(p[1][1]) + toBE32(p[1][0]);                           // Y.c1 || Y.c0

const vk = JSON.parse(readFileSync(resolve(BUILD, `${c}.vkey.json`), "utf8"));
if (vk.curve !== "bn128") throw new Error(`unexpected curve ${vk.curve}`);

const out = {
  circuit: c,
  nPublic: vk.nPublic,
  alpha: g1(vk.vk_alpha_1),
  beta: g2(vk.vk_beta_2),
  gamma: g2(vk.vk_gamma_2),
  delta: g2(vk.vk_delta_2),
  ic: vk.IC.map(g1),
};
const dest = resolve(BUILD, `${c}.soroban-vkey.json`);
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`wrote ${dest}  (nPublic=${vk.nPublic}, ic=${out.ic.length})`);
