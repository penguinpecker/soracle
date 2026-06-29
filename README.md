# Soracle — a verifiable oracle for Stellar

> **Don't trust the feed. Verify it.**

Soracle publishes real-world and cross-chain data feeds where **every published
value ships with a Groth16 proof that the value was correctly aggregated/derived
from its source inputs**. A Soroban verifier contract checks the proof on-chain
using the BN254 `pairing_check` host function (Protocol 25) **before** the value
is ever stored, so consumer contracts read a feed that is *proven*, not merely
*trusted*.

Built for **Stellar Hacks: Real-World ZK**.

---

## Live on Stellar Testnet

The contracts are deployed and initialized on Testnet:

| Contract | ID |
|---|---|
| Verifier | `CAK7BOFFQ7R7CFZWRVCAVL3R67E6ETMVH2T7RTTRGXLIWSAMKKYDPFWZ` |
| Registry | `CAE6NHSNEVA6N2IUABL6UATSPQH3VQ5VSXBBNVD2I7YQL6Y5S6RH6KNW` |
| Consumer (market) | `CDDBJKDVM5XRPLIPOXMPLJEZUFFN7WOLXZTOWHVSAMXHX4WWR3IINLMD` |

Three feeds are registered (sports consensus, cross-chain PnL, GitHub reputation).
A **live tamper-rejection** is verified: publishing a spoofed value (`999`) with a
bogus proof traps the transaction at the verifier and stores nothing — the
registry reconstructs the public signals from the call args and refuses to write
a value the verifier doesn't approve. `read_feed(1)` returns `None` afterward.

> The honest publish path (a *real* Groth16 proof verified on-chain) additionally
> requires compiling the circuits, which needs the `circom` binary installed
> locally — see Quickstart step 1. Once a verifying key is registered, a bad proof
> fails at the BN254 `pairing_check` (`ProofRejected`) and a valid one is stored.

---

## Honest trust model

Be precise about what the proof does and doesn't guarantee.

- **What the ZK guarantees:** the published value equals the agreed
  aggregation/derivation function `f` applied to a committed set of inputs — no
  cherry-picking, no bad math, no silent tampering of the computation. For
  confidential feeds it proves a *predicate* (e.g. `value > N`) without revealing
  the raw value.
- **What it does NOT guarantee by itself:** that the operator fetched honest
  *raw* inputs from the web. Mitigated, strongest first:
  1. **Authenticated inputs** — for on-chain/cross-chain feeds the raw inputs
     come from chain state (secured by that chain's consensus). Here the ZK is
     genuinely end-to-end meaningful.
  2. **Multi-source consensus** — for web feeds (sports), N independent sources
     must agree in-circuit; a single bad source can't move the value.
  3. **Input transparency** — a Poseidon commitment to the exact input set is
     stored on-chain so any value is auditable/disputable after the fact.
- **vs incumbents:** Reflector and RedStone on Stellar are *trusted relays* — you
  trust the publisher aggregated honestly. Soracle makes the aggregation
  **provable**. We are **not** "trustless"; we are *verifiable where it counts*.

This is **not** a zkTLS/Reclaim-style provenance protocol. We take the same kinds
of data points and deliver them as **proof-carrying oracle feeds**. The ZK proves
honest computation/aggregation, which is the load-bearing claim.

---

## Architecture

```
            ┌──────────────────────── off-chain ────────────────────────┐
 sources ──▶│  soracle-node                                              │
 (APIs,     │   1. fetch (adapter)  2. normalize  3. build witness       │
  RPCs,     │   4. snarkjs Groth16 prove                                 │
  chains)   │                          │ proof + public signals          │
            └──────────────────────────┼──────────────────────────────────┘
                                       ▼ submit tx
            ┌──────────────────────── on-chain (Soroban) ──────────────────┐
            │  verifier  ── pairing_check(BN254) ──▶ valid? ──┐             │
            │                                                 ▼             │
            │  registry  ── store {value, commitment, ts, epoch, circuit}  │
            │                              ▲                                │
            │  consumer  ── read_feed(id) ─┘  (settles a prediction market) │
            └────────────────────────────────────────────────────────────┘
```

Flow: source → fetch → normalize → witness → Groth16 proof → `registry.publish()`
→ registry reconstructs the public signals from the call args (anti-substitution)
→ calls `verifier.verify` → `pairing_check` passes → value + commitment stored →
consumer reads. A tampered value is rejected at the `verify` step.

---

## Monorepo layout

```
packages/
  circuits/          Circom 2.x + Groth16 (snarkjs). consensus / derivation / predicate.
  contracts/         Soroban (Rust): verifier, registry, consumer-example.
  node/              Off-chain prover/oracle service + adapters.
  sdk/               JS client to read feeds.
apps/
  demo/              React + Vite + Tailwind + Freighter single-page demo.
```

## Tech stack (verified versions, 2026-06)

| Layer | Choice |
|---|---|
| Circuits | Circom **2.2.3** + Groth16 via **snarkjs 0.7.6**, BN254 (`bn128`), circomlib |
| Contracts | Rust + **soroban-sdk 26.1.0** (BN254 `bn254` module + `pairing_check`) |
| Node | TypeScript / Node 20+, **@stellar/stellar-sdk 16.0.1**, snarkjs, circomlibjs |
| Demo | React 18 + Vite 6 + Tailwind 4, **@stellar/freighter-api 6.0.1** |

Two implementation details that are easy to get wrong and are handled here:

- **G2 coordinate swap (CAP-0074).** snarkjs stores Fp2 as `[c0, c1]` but the
  Stellar host expects `c1` first. Every G2 point is serialized `X.c1 || X.c0 ||
  Y.c1 || Y.c0`. See `packages/node/src/encoding.ts` and `circuits/scripts/vkey-to-soroban.mjs`.
  This is the #1 cause of "valid proof, verify returns false".
- **Public-signal layout.** The registry reconstructs the exact public signals
  from typed call args, in the order pinned in `packages/circuits/SIGNALS.md`.

---

## Quickstart

### 1. Circuits (build proving + verifying keys)

Requires `circom` (2.2.x, build from source) and `snarkjs` on PATH.

```bash
npm install
npm -w @soracle/circuits run compile      # r1cs + wasm + sym
npm -w @soracle/circuits run setup         # downloads Hermez ptau, makes zkeys
npm -w @soracle/circuits run export-vkey   # vkey.json per circuit
node packages/circuits/scripts/make-input.mjs                 # sample witness vectors
node packages/circuits/scripts/vkey-to-soroban.mjs consensus  # on-chain vkey bytes
```

### 2. Contracts (test + deploy to Testnet)

```bash
cargo test --manifest-path packages/contracts/Cargo.toml      # 11 tests
bash packages/contracts/deploy.sh                             # build + deploy (stellar CLI)
```

### 3. Node (prove + publish)

```bash
cp packages/node/.env.example packages/node/.env              # fill in ids + keys
npm -w @soracle/node run cli init                             # init + wire contracts
npm -w @soracle/node run cli register-vkey consensus
npm -w @soracle/node run cli register-vkey derivation
npm -w @soracle/node run cli register-feeds
npm -w @soracle/node start                                    # scheduler: fetch->prove->publish
# or a single shot:  npm -w @soracle/node run cli tick
# tamper demo:        npm -w @soracle/node run cli tamper sports:demo-fixture
```

### 4. Demo

```bash
cp apps/demo/.env.example apps/demo/.env                      # set VITE_SORACLE_REGISTRY_ID
npm -w soracle-demo run dev
```

The demo polls live feeds, shows the on-chain proof status, and demonstrates a
spoofed value being **rejected on-chain** (a read-only simulation of `publish`
with a bogus proof — no keys needed).

---

## Definition of done

1. ✅ A value is published only after an on-chain `pairing_check` passes; a
   tampered value/proof is rejected on-chain (live in the demo + `cli tamper`).
2. ✅ `inputs_commitment` is stored on-chain and reproducible from the inputs.
3. ✅ Hero feeds run end-to-end (fetch → prove → publish) through one engine:
   **sports consensus** and **cross-chain PnL**, plus GitHub reputation for breadth.
4. ✅ `consumer-example` reads a Soracle feed and settles a prediction market on it.
5. ✅ Honest trust model documented (above) — no "trustless" overclaim.

## Known limitations

- **Trusted setup.** Uses an existing Hermez Powers-of-Tau and a single public
  beacon for phase 2 — fine for a hackathon, not a real ceremony. Run a real
  multi-party phase 2 for production.
- **Signed PnL.** The on-chain `i128` publish path is non-negative; negative
  realized PnL would need field reduction (`p − |v|`). Demo data is positive.
- **Confidential predicate feeds.** `predicate.circom` (7-signal, no epoch) is
  built and tested at the circuit level; wiring it through the registry needs a
  dedicated publish variant. The breadth adapters (GitHub, NFT) currently run as
  derivation feeds so they flow through the existing engine.
- **Verifier reference.** The BN254 Groth16 verifier is adapted from an unmerged
  Stellar example (demonstration-grade); review before mainnet.
