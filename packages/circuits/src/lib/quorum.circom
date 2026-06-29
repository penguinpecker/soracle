pragma circom 2.1.9;

include "circomlib/circuits/comparators.circom";

// Counts how many of `values[n]` equal `target` and asserts the count >= k.
// Used by the consensus circuit for discrete outcomes (e.g. a final sports
// score): no single source and no operator shortcut can move the result
// unless at least k of the committed sources actually report it.
template Quorum(n, k) {
    signal input values[n];
    signal input target;
    signal output count;

    component eq[n];
    signal partial[n + 1];
    partial[0] <== 0;
    for (var i = 0; i < n; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== values[i];
        eq[i].in[1] <== target;
        partial[i + 1] <== partial[i] + eq[i].out;
    }
    count <== partial[n];

    // count >= k  (count fits in a few bits for the small n we allow)
    component ge = GreaterEqThan(8);
    ge.in[0] <== count;
    ge.in[1] <== k;
    ge.out === 1;
}
