// Generate valid input vectors for each circuit (computes the Poseidon
// commitments with circomlibjs so they match the in-circuit Poseidon exactly).
// Usage: node scripts/make-input.mjs        (writes all three)
import { buildPoseidon } from "circomlibjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../test/inputs");
mkdirSync(OUT, { recursive: true });

const SALT = 1234567890n;
const poseidon = await buildPoseidon();
const F = poseidon.F;
const commit = (vals) => F.toObject(poseidon(vals.map(BigInt))).toString();

function write(name, obj) {
  const p = resolve(OUT, `${name}.input.json`);
  writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log(`wrote ${p}`);
}

// --- consensus: 3 sources, 2 agree on result=2 (quorum 2-of-3) ---
{
  const values = [2n, 2n, 1n];
  write("consensus", {
    feed_id: "1",
    n_sources: "3",
    result: "2",
    inputs_commitment: commit([...values, SALT]),
    timestamp: "1719600000",
    epoch: "1",
    values: values.map(String),
    salt: SALT.toString(),
  });
}

// --- derivation: 5 records, realized PnL = Σ(sell-buy-fee) = 45 (positive) ---
{
  const buy  = [100n, 0n, 0n, 0n, 0n];
  const sell = [150n, 0n, 0n, 0n, 0n];
  const fee  = [5n, 0n, 0n, 0n, 0n];
  const pnl = sell.reduce((a, s, i) => a + s - buy[i] - fee[i], 0n);
  write("derivation", {
    feed_id: "2",
    wallet_id_hash: commit([0xabcdefn]), // stand-in wallet id hash
    result: pnl.toString(),
    inputs_commitment: commit([...buy, ...sell, ...fee, SALT]),
    timestamp: "1719600000",
    epoch: "1",
    buy: buy.map(String),
    sell: sell.map(String),
    fee: fee.map(String),
    salt: SALT.toString(),
  });
}

// --- predicate: hidden value=1000 > threshold=500 -> outcome_bit=1 ---
{
  const value = 1000n;
  write("predicate", {
    feed_id: "3",
    subject_hash: commit([0x1234n]),
    predicate_id: "1",
    threshold: "500",
    outcome_bit: "1",
    value_commitment: commit([value, SALT]),
    timestamp: "1719600000",
    value: value.toString(),
    salt: SALT.toString(),
  });
}

console.log("done");
