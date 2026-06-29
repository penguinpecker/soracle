pragma circom 2.1.9;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// ============================================================================
// Confidential feeds — threshold predicate (e.g. followers > N, gating).
//
// Proves: outcome_bit == (value > threshold) for a value the prover never
// reveals — only a Poseidon commitment to it is public. Good for follower /
// reputation gating without leaking the raw metric.
//
// PUBLIC SIGNAL ORDER (registry reconstructs exactly this):
//   [0] feed_id
//   [1] subject_hash
//   [2] predicate_id
//   [3] threshold
//   [4] outcome_bit
//   [5] value_commitment
//   [6] timestamp
// ============================================================================
template Predicate(nBits) {
    // --- public ---
    signal input feed_id;
    signal input subject_hash;
    signal input predicate_id;
    signal input threshold;
    signal input outcome_bit;
    signal input value_commitment;
    signal input timestamp;
    // --- private ---
    signal input value;
    signal input salt;

    // 1. value_commitment == Poseidon(value, salt)
    component h = Poseidon(2);
    h.inputs[0] <== value;
    h.inputs[1] <== salt;
    value_commitment === h.out;

    // 2. range-check BOTH operands. GreaterThan/LessThan are only sound when
    //    both inputs are < 2^nBits — without a check on the public `threshold`,
    //    a prover could pick an out-of-field threshold to force outcome_bit.
    component rc = Num2Bits(nBits);
    rc.in <== value;
    component rcT = Num2Bits(nBits);
    rcT.in <== threshold;

    // 3. outcome_bit == (value > threshold)
    component gt = GreaterThan(nBits);
    gt.in[0] <== value;
    gt.in[1] <== threshold;
    outcome_bit === gt.out;
}

// Default instance: 64-bit metrics (follower counts, contribution totals…).
component main { public [feed_id, subject_hash, predicate_id, threshold, outcome_bit, value_commitment, timestamp] } = Predicate(64);
