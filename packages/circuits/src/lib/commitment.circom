pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";

// Poseidon commitment over `n` field elements plus a domain salt.
// Soracle publishes `inputs_commitment = Commitment(values, salt)` on-chain so
// any feed value is auditable/disputable against its exact input set later.
//
// circomlib Poseidon supports up to 16 inputs, so keep (n + 1) <= 16.
// The off-chain mirror (node/aggregate.ts) MUST use circomlibjs `buildPoseidon`
// to compute the identical hash, or proofs will fail the on-chain check.
template Commitment(n) {
    signal input values[n];
    signal input salt;
    signal output out;

    component h = Poseidon(n + 1);
    for (var i = 0; i < n; i++) {
        h.inputs[i] <== values[i];
    }
    h.inputs[n] <== salt;
    out <== h.out;
}
