// Feed catalogue + value formatters (moved out of App so every component shares them).

export interface FeedDef {
  id: number;
  name: string;
  source: string;
  circuit: "consensus" | "derivation";
  unit: string;
  /** how a raw i128 value renders for humans */
  format: (v: bigint) => string;
}

export const FEEDS: FeedDef[] = [
  {
    id: 1,
    name: "EPL · final score",
    source: "3 sports APIs · 2-of-3 quorum",
    circuit: "consensus",
    unit: "score",
    format: (v) => `${v / 1000n}–${v % 1000n}`,
  },
  {
    id: 2,
    name: "Wallet realized PnL",
    source: "EVM chain records · in-circuit Σ",
    circuit: "derivation",
    unit: "units",
    format: (v) => `${v.toLocaleString()}`,
  },
  {
    id: 3,
    name: "Developer reputation",
    source: "GitHub public API",
    circuit: "derivation",
    unit: "score",
    format: (v) => `${v.toLocaleString()}`,
  },
];

/** Encode a final score the way the sports adapter does: home*1000 + away. */
export const encodeScore = (home: number, away: number): number => home * 1000 + away;
export const decodeScore = (v: number): [number, number] => [Math.floor(v / 1000), v % 1000];

export const DEMO_SALT = "1234567890";
