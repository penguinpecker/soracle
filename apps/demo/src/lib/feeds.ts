// Feed catalogue + value formatters (moved out of App so every component shares them).

export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface FeedDef {
  id: number;
  kind: "sports" | "pnl" | "github";
  name: string;
  subjectLabel: string; // what the user is querying (e.g. fixture / wallet / handle)
  source: string;
  web: "WEB2" | "WEB3";
  circuit: "consensus" | "derivation";
  vkId: number;
  unit: string;
  /** how a raw i128 value renders for humans */
  format: (v: bigint) => string;
}

export const FEEDS: FeedDef[] = [
  {
    id: 1,
    kind: "sports",
    name: "Match final score",
    subjectLabel: "Arsenal vs. Spurs",
    source: "3 sports APIs · 2-of-3 quorum",
    web: "WEB2",
    circuit: "consensus",
    vkId: 1,
    unit: "score",
    format: (v) => `${v / 1000n}–${v % 1000n}`,
  },
  {
    id: 2,
    kind: "pnl",
    name: "Wallet realized PnL",
    subjectLabel: "0x71C…F19 · Base",
    source: "on-chain trade records · in-circuit Σ",
    web: "WEB3",
    circuit: "derivation",
    vkId: 2,
    unit: "USDC",
    format: (v) => `${v.toLocaleString()}`,
  },
  {
    id: 3,
    kind: "github",
    name: "Developer reputation",
    subjectLabel: "github.com/torvalds",
    source: "GitHub public API",
    web: "WEB2",
    circuit: "derivation",
    vkId: 2,
    unit: "rep",
    format: (v) => `${v.toLocaleString()}`,
  },
];

/** Deterministic field element from any subject string (the public wallet_id_hash). */
export function fieldFromString(s: string): string {
  let acc = 0n;
  for (const ch of s) acc = (acc * 131n + BigInt(ch.charCodeAt(0))) % FIELD;
  return (acc === 0n ? 1n : acc).toString();
}

/** Encode a final score the way the sports adapter does: home*1000 + away. */
export const encodeScore = (home: number, away: number): number => home * 1000 + away;
export const decodeScore = (v: number): [number, number] => [Math.floor(v / 1000), v % 1000];

export const DEMO_SALT = "1234567890";
