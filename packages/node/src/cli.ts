#!/usr/bin/env -S npx tsx
// Soracle admin/ops CLI.
//   tsx src/cli.ts init                 # init verifier+registry, wire them
//   tsx src/cli.ts register-vkey <c>    # register a circuit's vkey (admin)
//   tsx src/cli.ts register-feeds       # register every enabled feed (admin)
//   tsx src/cli.ts tick [feedId]        # one fetch->prove->publish for a/all feeds
//   tsx src/cli.ts tamper <feedId>      # prove honestly, publish a SPOOFED value -> rejected
import { readFileSync } from "node:fs";
import { loadAdapters } from "./adapters/index.js";
import { CIRCUIT_ID, circuitArtifacts } from "./config.js";
import { prove, verifyLocal } from "./prover.js";
import { runOnce } from "./scheduler.js";
import { initContracts, publishFeed, registerFeed, registerVkey } from "./submit.js";

const [cmd, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "init":
      await initContracts();
      console.log("✓ verifier + registry initialized");
      break;

    case "register-vkey": {
      const circuit = arg ?? "consensus";
      await registerVkey(circuit);
      console.log(`✓ registered vkey for ${circuit} (vk_id=${CIRCUIT_ID[circuit]})`);
      break;
    }

    case "register-feeds": {
      for (const a of loadAdapters()) {
        const aux1 = await a.registerAux1();
        await registerFeed(a.feedNumericId, a.circuit, aux1);
        console.log(`✓ registered feed ${a.feedId} (#${a.feedNumericId}, ${a.circuit})`);
      }
      break;
    }

    case "tick": {
      const adapters = loadAdapters().filter((a) => !arg || a.feedId === arg);
      for (const a of adapters) {
        const r = await runOnce(a, Math.floor(Date.now() / 1000));
        console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
      }
      break;
    }

    case "tamper": {
      // Prove an HONEST value, then publish value+1. The registry reconstructs
      // public signals from the spoofed value -> on-chain verify fails.
      const a = loadAdapters().find((x) => x.feedId === arg);
      if (!a) throw new Error(`feed not found: ${arg}`);
      const tick = await a.tick(Math.floor(Date.now() / 1000));
      if (!tick) throw new Error("adapter returned no-update; try again");
      const { proof, publicSignals } = await prove(tick.circuit, tick.witness);
      const vk = JSON.parse(readFileSync(circuitArtifacts(tick.circuit).vkey, "utf8"));
      console.log(`honest value=${tick.value}, local verify=${await verifyLocal(vk, publicSignals, proof)}`);
      const spoofed = tick.value + 1n;
      console.log(`publishing SPOOFED value=${spoofed} with the honest proof…`);
      try {
        await publishFeed({
          feedId: a.feedNumericId,
          value: spoofed,
          inputsCommitment: tick.inputsCommitment,
          timestamp: tick.timestamp,
          epoch: tick.epoch,
          proof,
        });
        console.error("✗ UNEXPECTED: spoofed value was accepted!");
        process.exitCode = 1;
      } catch (e) {
        console.log(`✓ rejected on-chain as expected: ${(e as Error).message}`);
      }
      break;
    }

    default:
      console.log("usage: cli.ts <init|register-vkey|register-feeds|tick|tamper> [arg]");
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
