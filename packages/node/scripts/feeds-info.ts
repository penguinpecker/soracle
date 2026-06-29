// Print on-chain registration params for each enabled feed:
//   <feedNumericId> <circuit_id> <aux1-hex32> <feedId>
// aux1 is computed via the same Poseidon the circuit uses (no circom needed).
import { loadAdapters } from "../src/adapters/index.ts";
import { CIRCUIT_ID } from "../src/config.ts";

for (const a of loadAdapters()) {
  const aux1 = await a.registerAux1();
  const hex = aux1.toString(16).padStart(64, "0");
  console.log(`${a.feedNumericId} ${CIRCUIT_ID[a.circuit]} ${hex} ${a.feedId}`);
}
