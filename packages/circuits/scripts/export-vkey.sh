#!/usr/bin/env bash
# Export verification keys (JSON) for each circuit. The vkey JSON is the only
# build artifact committed to git (see .gitignore); the Soroban verifier hard-
# codes / registers these per circuit_id.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=build
CIRCUITS=("consensus" "derivation" "predicate")

for c in "${CIRCUITS[@]}"; do
  echo "==> export verificationkey: $c"
  snarkjs zkey export verificationkey "$OUT/${c}.zkey" "$OUT/${c}.vkey.json"
done

echo "==> vkeys -> $OUT/*.vkey.json"
echo "Next: run scripts/vkey-to-soroban.mjs to emit the on-chain verifier params."
