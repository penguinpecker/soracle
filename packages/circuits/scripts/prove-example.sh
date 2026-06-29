#!/usr/bin/env bash
# Prove a circuit against a static input vector and verify locally with snarkjs.
# Usage: bash scripts/prove-example.sh consensus
# This is the M0 de-risk step: get a real proof before any feeds exist.
set -euo pipefail

cd "$(dirname "$0")/.."
C="${1:-consensus}"
OUT=build
WASM="$OUT/${C}_js/${C}.wasm"
ZKEY="$OUT/${C}.zkey"
VKEY="$OUT/${C}.vkey.json"
INPUT="test/inputs/${C}.input.json"

[ -f "$WASM" ] || { echo "missing $WASM — run npm run compile"; exit 1; }
[ -f "$ZKEY" ] || { echo "missing $ZKEY — run npm run setup";   exit 1; }

echo "==> fullprove $C"
snarkjs groth16 fullprove "$INPUT" "$WASM" "$ZKEY" \
  "$OUT/${C}.proof.json" "$OUT/${C}.public.json"

echo "==> verify $C locally"
snarkjs groth16 verify "$VKEY" "$OUT/${C}.public.json" "$OUT/${C}.proof.json"

echo "==> public signals:"
cat "$OUT/${C}.public.json"
