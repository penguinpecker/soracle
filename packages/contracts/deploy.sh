#!/usr/bin/env bash
# Build + deploy the Soracle contracts to Stellar Testnet.
# Requires: stellar-cli, a funded identity (`stellar keys generate --fund admin`),
# and the wasm32 target (`rustup target add wasm32-unknown-unknown` or
# `wasm32v1-none` for newer stellar-cli — `stellar contract build` selects it).
set -euo pipefail

cd "$(dirname "$0")"
NET="${STELLAR_NETWORK:-testnet}"
SRC="${STELLAR_SOURCE:-admin}"

echo "==> building contracts (release wasm)"
stellar contract build

WASM=target/wasm32-unknown-unknown/release
[ -d "$WASM" ] || WASM=target/wasm32v1-none/release   # newer stellar-cli target

deploy() {
  local wasm="$1"
  stellar contract deploy --wasm "$wasm" --source "$SRC" --network "$NET" 2>/dev/null
}

echo "==> deploying verifier"
VERIFIER_ID=$(deploy "$WASM/soracle_verifier.wasm")
echo "    VERIFIER_ID=$VERIFIER_ID"

echo "==> deploying registry"
REGISTRY_ID=$(deploy "$WASM/soracle_registry.wasm")
echo "    REGISTRY_ID=$REGISTRY_ID"

echo "==> deploying consumer-example"
CONSUMER_ID=$(deploy "$WASM/soracle_consumer_example.wasm")
echo "    CONSUMER_ID=$CONSUMER_ID"

cat <<EOF

Add these to packages/node/.env and apps/demo/.env:
  SORACLE_VERIFIER_ID=$VERIFIER_ID
  SORACLE_REGISTRY_ID=$REGISTRY_ID
  VITE_SORACLE_VERIFIER_ID=$VERIFIER_ID
  VITE_SORACLE_REGISTRY_ID=$REGISTRY_ID

Then: npm -w @soracle/node run cli init
EOF
