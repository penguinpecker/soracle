# Public signal layout (the contract MUST reconstruct these exactly)

> Pitfall #1 in the build brief: "valid proof, failed verify" is almost always a
> public-signal mismatch. The Soroban `registry` reconstructs the expected public
> signals from the `publish()` call args and feeds them to the verifier in
> **exactly** the order below. snarkjs `public.json` lists public signals in the
> order the `main` component declares them — keep all four artifacts (circuit,
> `aggregate.ts`, `submit.ts` ScVal packing, contract reconstruction) in lockstep.

All signals are BN254 field elements (decimal in `public.json`, 32-byte
big-endian `BytesN<32>` on-chain).

## consensus.circom  (circuit_id = 1)

| idx | signal              | bound on-chain from           |
|-----|---------------------|-------------------------------|
| 0   | `feed_id`           | call arg `feed_id`            |
| 1   | `n_sources`         | compiled constant (N=3)       |
| 2   | `result`            | call arg `value`              |
| 3   | `inputs_commitment` | call arg `inputs_commitment`  |
| 4   | `timestamp`         | call arg `timestamp`          |
| 5   | `epoch`             | call arg `epoch`              |

## derivation.circom  (circuit_id = 2)

| idx | signal              | bound on-chain from           |
|-----|---------------------|-------------------------------|
| 0   | `feed_id`           | call arg `feed_id`            |
| 1   | `wallet_id_hash`    | derived from feed metadata    |
| 2   | `result`            | call arg `value`              |
| 3   | `inputs_commitment` | call arg `inputs_commitment`  |
| 4   | `timestamp`         | call arg `timestamp`          |
| 5   | `epoch`             | call arg `epoch`              |

## predicate.circom  (circuit_id = 3)

| idx | signal              | bound on-chain from           |
|-----|---------------------|-------------------------------|
| 0   | `feed_id`           | call arg `feed_id`            |
| 1   | `subject_hash`      | feed metadata                 |
| 2   | `predicate_id`      | feed metadata                 |
| 3   | `threshold`         | call arg / feed config        |
| 4   | `outcome_bit`       | call arg `value` (0/1)        |
| 5   | `value_commitment`  | call arg `inputs_commitment`  |
| 6   | `timestamp`         | call arg `timestamp`          |

## Anti-replay / anti-substitution

`value`, `feed_id`, and `timestamp` are bound into the public signals, so a valid
proof cannot be replayed for a different value. `registry.publish` additionally
rejects `timestamp <= stored.timestamp` and any already-seen `epoch`.
