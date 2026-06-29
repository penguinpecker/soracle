#!/usr/bin/env bash
# Build + deploy the Soracle contracts to Stellar Testnet. Each contract binds
# its admin/verifier/publisher/registry atomically via __constructor at deploy
# time (constructor args after the `--`), so there is no separate init step.
#
# Requires: stellar-cli, funded identities (`stellar keys generate admin --fund
# --network testnet` and likewise `publisher`), and the wasm target. If `cargo`
# resolves to a Homebrew toolchain without wasm std, prepend rustup's shims:
#   export PATH="$HOME/.cargo/bin:$PATH"
set -euo pipefail

cd "$(dirname "$0")"
NET="${STELLAR_NETWORK:-testnet}"
SRC="${STELLAR_SOURCE:-admin}"
ADMIN=$(stellar keys address admin)
PUBLISHER=$(stellar keys address publisher)

echo "==> building contracts (release wasm)"
stellar contract build
W=target/wasm32v1-none/release
[ -d "$W" ] || W=target/wasm32-unknown-unknown/release

deploy() { stellar contract deploy --wasm "$1" --source "$SRC" --network "$NET" -- "${@:2}"; }

echo "==> deploy verifier (admin=$ADMIN)"
VERIFIER=$(deploy "$W/soracle_verifier.wasm" --admin "$ADMIN")
echo "    VERIFIER=$VERIFIER"

echo "==> deploy registry (verifier=$VERIFIER, publisher=$PUBLISHER)"
REGISTRY=$(deploy "$W/soracle_registry.wasm" --admin "$ADMIN" --verifier "$VERIFIER" --publisher "$PUBLISHER")
echo "    REGISTRY=$REGISTRY"

echo "==> deploy consumer-example (registry=$REGISTRY)"
CONSUMER=$(deploy "$W/soracle_consumer_example.wasm" --registry "$REGISTRY")
echo "    CONSUMER=$CONSUMER"

cat <<EOF

Add to packages/node/.env and apps/demo/.env:
  SORACLE_VERIFIER_ID=$VERIFIER
  SORACLE_REGISTRY_ID=$REGISTRY
  VITE_SORACLE_VERIFIER_ID=$VERIFIER
  VITE_SORACLE_REGISTRY_ID=$REGISTRY

Then (no init needed — constructors ran at deploy):
  npm -w @soracle/node run cli register-vkey consensus
  npm -w @soracle/node run cli register-feeds
EOF
