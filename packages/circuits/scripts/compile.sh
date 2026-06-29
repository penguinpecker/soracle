#!/usr/bin/env bash
# Compile each circuit family to r1cs + wasm + sym.
# Requires: circom 2.x on PATH, circomlib installed under node_modules.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=src
OUT=build
mkdir -p "$OUT"

CIRCUITS=("consensus" "derivation" "predicate")

for c in "${CIRCUITS[@]}"; do
  echo "==> compiling $c.circom"
  circom "$SRC/$c.circom" \
    --r1cs --wasm --sym \
    -l node_modules \
    -l "$SRC" \
    -o "$OUT"
  # report constraint count (keep each circuit < ~50k — brief §3)
  snarkjs r1cs info "$OUT/$c.r1cs"
done

echo "==> compile done -> $OUT/"
