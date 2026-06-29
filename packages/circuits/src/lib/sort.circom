pragma circom 2.1.9;

include "circomlib/circuits/comparators.circom";

// Data-independent compare-and-swap: outputs (lo, hi) = (min(a,b), max(a,b)).
// Inputs must be range-checked to < 2^nBits by the caller.
template CompSwap(nBits) {
    signal input a;
    signal input b;
    signal output lo;
    signal output hi;

    component lt = LessThan(nBits);
    lt.in[0] <== a;
    lt.in[1] <== b;

    // s == 1 when a < b
    signal s;
    s <== lt.out;
    lo <== s * a + (1 - s) * b;
    hi <== s * b + (1 - s) * a;
}

// Median of 3 via a 3-comparator sorting network. Returns the middle element.
// For numeric consensus feeds where the published value must be the median of
// the committed source set. Keep N tiny (3 or 5) to bound constraints.
template Median3(nBits) {
    signal input in[3];
    signal output out;

    component cs1 = CompSwap(nBits); // sort (1,2)
    cs1.a <== in[1];
    cs1.b <== in[2];

    component cs2 = CompSwap(nBits); // sort (0,2)
    cs2.a <== in[0];
    cs2.b <== cs1.hi;

    component cs3 = CompSwap(nBits); // sort (0,1)
    cs3.a <== cs2.lo;
    cs3.b <== cs1.lo;

    // After the network the middle (sorted index 1) is the median.
    out <== cs3.hi;
}
