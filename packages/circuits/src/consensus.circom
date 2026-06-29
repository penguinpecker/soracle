pragma circom 2.1.9;

include "circomlib/circuits/bitify.circom";
include "lib/commitment.circom";
include "lib/quorum.circom";

// ============================================================================
// Hero feed 1 — multi-source consensus (sports scores, web data).
//
// Proves: the published `result` is reported by at least K of N committed,
// range-checked sources. A single bad source (or a dishonest operator who
// wants to inject a value none of the sources reported) cannot move it.
//
// PUBLIC SIGNAL ORDER (the on-chain registry MUST reconstruct exactly this,
// in this order — see packages/circuits/SIGNALS.md):
//   [0] feed_id
//   [1] n_sources
//   [2] result
//   [3] inputs_commitment
//   [4] timestamp
//   [5] epoch
// ============================================================================
template Consensus(N, K) {
    // --- public ---
    signal input feed_id;
    signal input n_sources;
    signal input result;
    signal input inputs_commitment;
    signal input timestamp;
    signal input epoch;
    // --- private ---
    signal input values[N];
    signal input salt;

    // 1. The commitment binds the exact input set published on-chain.
    component c = Commitment(N);
    for (var i = 0; i < N; i++) { c.values[i] <== values[i]; }
    c.salt <== salt;
    inputs_commitment === c.out;

    // bind the advertised source count to the compiled N
    n_sources === N;

    // 2. Range-check every source value (sports scores fit in 32 bits).
    component rc[N];
    for (var i = 0; i < N; i++) {
        rc[i] = Num2Bits(32);
        rc[i].in <== values[i];
    }

    // 3. Quorum: at least K of N sources agree on `result`.
    component q = Quorum(N, K);
    for (var i = 0; i < N; i++) { q.values[i] <== values[i]; }
    q.target <== result;
}

// Default instance: 3 sources, quorum 2-of-3 (the sports hero feed).
component main { public [feed_id, n_sources, result, inputs_commitment, timestamp, epoch] } = Consensus(3, 2);
