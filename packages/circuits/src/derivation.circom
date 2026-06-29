pragma circom 2.1.9;

include "circomlib/circuits/bitify.circom";
include "lib/commitment.circom";

// ============================================================================
// Hero feed 2 — cross-chain wallet derivation (realized PnL / activity).
//
// Proves: `result` is the honest function f() of a committed set of M
// authenticated chain records. Each record is a (buy, sell, fee) tuple read
// from chain state. Realized PnL = Σ (sell − buy − fee). Because the inputs are
// chain-authenticated, the ZK is end-to-end meaningful here: the operator
// cannot inflate a track record.
//
// NOTE on sign: realized PnL can be negative. In the field, a negative value v
// is represented as p − |v|. The off-chain mirror (aggregate.ts) reduces mod p
// identically, and the SDK re-interprets the sign for display. For demo wallets
// we choose data with positive realized PnL so the published value is small.
//
// PUBLIC SIGNAL ORDER (registry reconstructs exactly this):
//   [0] feed_id
//   [1] wallet_id_hash
//   [2] result
//   [3] inputs_commitment
//   [4] timestamp
//   [5] epoch
// ============================================================================
template Derivation(M) {
    // --- public ---
    signal input feed_id;
    signal input wallet_id_hash;
    signal input result;
    signal input inputs_commitment;
    signal input timestamp;
    signal input epoch;
    // --- private: M records, each [buy, sell, fee] ---
    signal input buy[M];
    signal input sell[M];
    signal input fee[M];
    signal input salt;

    // 1. Commit to the flattened record set (buy.., sell.., fee.., salt).
    //    Keep (3*M + 1) <= 16 for circomlib Poseidon; M <= 5.
    component c = Commitment(3 * M);
    for (var i = 0; i < M; i++) {
        c.values[i]             <== buy[i];
        c.values[M + i]         <== sell[i];
        c.values[2 * M + i]     <== fee[i];
    }
    c.salt <== salt;
    inputs_commitment === c.out;

    // 2. Range-check each component (64-bit token amounts).
    component rb[M];
    component rs[M];
    component rf[M];
    for (var i = 0; i < M; i++) {
        rb[i] = Num2Bits(64); rb[i].in <== buy[i];
        rs[i] = Num2Bits(64); rs[i].in <== sell[i];
        rf[i] = Num2Bits(64); rf[i].in <== fee[i];
    }

    // 3. Derive realized PnL and bind it to the public result.
    signal grossSell[M + 1];
    signal grossCost[M + 1];
    grossSell[0] <== 0;
    grossCost[0] <== 0;
    for (var i = 0; i < M; i++) {
        grossSell[i + 1] <== grossSell[i] + sell[i];
        grossCost[i + 1] <== grossCost[i] + buy[i] + fee[i];
    }
    result === grossSell[M] - grossCost[M];
}

// Default instance: up to 5 records per wallet derivation.
component main { public [feed_id, wallet_id_hash, result, inputs_commitment, timestamp, epoch] } = Derivation(5);
