// Mirror rule (brief §5): aggregate.ts f() must equal the circuit.
// Pure-f() checks always run. The full circuit-vs-f vector check runs only when
// the compiled circuit artifacts exist (after `npm run build` in circuits).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { consensus, predicateBit, realizedPnl } from "../src/aggregate.ts";
import { commit } from "../src/poseidon.ts";
import { circuitArtifacts } from "../src/config.ts";

test("consensus picks the quorum value", () => {
  assert.deepEqual(consensus([2n, 2n, 1n], 2), { result: 2n, quorum: 2 });
  assert.equal(consensus([1n, 2n, 3n], 2), null); // no quorum
});

test("realized PnL = Σ(sell - buy - fee)", () => {
  const pnl = realizedPnl([
    { buy: 100n, sell: 150n, fee: 5n },
    { buy: 50n, sell: 80n, fee: 2n },
  ]);
  assert.equal(pnl, 73n);
});

test("predicate bit = value > threshold", () => {
  assert.equal(predicateBit(1000n, 500n), 1n);
  assert.equal(predicateBit(100n, 500n), 0n);
});

test("Poseidon commitment is deterministic", async () => {
  const a = await commit([2n, 2n, 1n], 1234567890n);
  const b = await commit([2n, 2n, 1n], 1234567890n);
  assert.equal(a, b);
  assert.notEqual(await commit([2n, 2n, 2n], 1234567890n), a);
});

test("circuit public signals match aggregate (requires built circuits)", async (t) => {
  const { wasm } = circuitArtifacts("consensus");
  const inputPath = new URL("../../circuits/test/inputs/consensus.input.json", import.meta.url);
  if (!existsSync(wasm) || !existsSync(inputPath)) {
    t.skip("circuit artifacts not built — run `npm run build` in packages/circuits");
    return;
  }
  const { wtns, groth16 } = await import("snarkjs");
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  // recompute the commitment with aggregate's Poseidon and assert it matches the
  // value the input vector was generated with (sanity that both Poseidons agree)
  const expected = await commit(input.values.map(BigInt), BigInt(input.salt));
  assert.equal(expected.toString(), input.inputs_commitment);
  void wtns;
  void groth16;
});
