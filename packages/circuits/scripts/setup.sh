#!/usr/bin/env bash
# Groth16 trusted setup using an EXISTING Hermez Powers-of-Tau (phase 1).
# We do NOT hand-roll a ceremony (brief §3). The phase-2 step here uses a public
# beacon to finalize the zkey — fine for a hackathon, documented as a known
# limitation in the README. For production, run a real multi-party phase 2.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=build
mkdir -p "$OUT"

# 2^16 = 65536 constraints — comfortably above our circuits (brief budgets < 50k).
PTAU="$OUT/pot16_final.ptau"
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"

if [ ! -f "$PTAU" ]; then
  echo "==> downloading Hermez ptau (one-time)"
  curl -fL --retry 3 -o "$PTAU" "$PTAU_URL"
fi

CIRCUITS=("consensus" "derivation" "predicate")
# A fixed, public beacon — NOT a secure ceremony. Documented limitation.
BEACON="0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"

for c in "${CIRCUITS[@]}"; do
  echo "==> groth16 setup: $c"
  snarkjs groth16 setup "$OUT/$c.r1cs" "$PTAU" "$OUT/${c}_0000.zkey"
  echo "==> finalize zkey with public beacon: $c"
  snarkjs zkey beacon "$OUT/${c}_0000.zkey" "$OUT/${c}.zkey" "$BEACON" 10 \
    -n "soracle hackathon beacon"
  rm -f "$OUT/${c}_0000.zkey"
done

echo "==> setup done -> $OUT/*.zkey"
