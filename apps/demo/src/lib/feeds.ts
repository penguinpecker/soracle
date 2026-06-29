// Feed catalogue: 3 web2 + 3 web3, spanning all three circuit families
// (consensus / derivation / predicate). Shared by every component.

export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DEMO_SALT = "1234567890";

export type Circuit = "consensus" | "derivation" | "predicate";
export type InputKind = "scores" | "prices" | "reputation" | "records" | "threshold";

export interface FeedDef {
  id: number;
  web: "WEB2" | "WEB3";
  circuit: Circuit;
  vkId: number;
  inputKind: InputKind;
  name: string;
  subjectLabel: string;
  source: string;
  unit: string;
  /** how a raw published value renders for humans */
  format: (v: bigint) => string;
  /** one-line claim the proof attests (shown in the tx-confirm popup) */
  claim: string;
}

const num = (v: bigint) => v.toLocaleString();

export const WEB2_FEEDS: FeedDef[] = [
  {
    id: 1, web: "WEB2", circuit: "consensus", vkId: 1, inputKind: "scores",
    name: "Football final score", subjectLabel: "Arsenal vs. Spurs",
    source: "3 sports APIs · 2-of-3 quorum", unit: "score",
    format: (v) => `${v / 1000n}–${v % 1000n}`,
    claim: "the score ≥2 of 3 independent APIs agree on — no single source can move it",
  },
  {
    id: 3, web: "WEB2", circuit: "derivation", vkId: 2, inputKind: "reputation",
    name: "Developer reputation", subjectLabel: "github.com/torvalds",
    source: "GitHub public API · in-circuit Σ", unit: "rep",
    format: num,
    claim: "reputation = followers + public repos, computed honestly in-circuit",
  },
  {
    id: 5, web: "WEB2", circuit: "predicate", vkId: 3, inputKind: "threshold",
    name: "Creator reach", subjectLabel: "social handle (confidential)",
    source: "social API · zero-knowledge threshold", unit: "bit",
    format: (v) => (v === 1n ? "ABOVE ✓" : "BELOW"),
    claim: "the follower count clears the threshold — without revealing the exact number",
  },
];

export const WEB3_FEEDS: FeedDef[] = [
  {
    id: 2, web: "WEB3", circuit: "derivation", vkId: 2, inputKind: "records",
    name: "Wallet realized PnL", subjectLabel: "0x71C…F19 · Base",
    source: "on-chain trade records · in-circuit Σ", unit: "USDC",
    format: num,
    claim: "realized PnL = Σ(sell − buy − fee) over authenticated on-chain trades",
  },
  {
    id: 4, web: "WEB3", circuit: "consensus", vkId: 1, inputKind: "prices",
    name: "ETH / USD spot", subjectLabel: "3 RPC price sources",
    source: "3 chain oracles · 2-of-3 quorum", unit: "USD",
    format: num,
    claim: "the price ≥2 of 3 independent chain oracles agree on",
  },
  {
    id: 6, web: "WEB3", circuit: "predicate", vkId: 3, inputKind: "threshold",
    name: "Treasury solvency", subjectLabel: "DAO multisig · Base",
    source: "chain balance · zero-knowledge threshold", unit: "bit",
    format: (v) => (v === 1n ? "SOLVENT ✓" : "BELOW"),
    claim: "the treasury balance clears the solvency floor — exact balance stays private",
  },
];

export const ALL_FEEDS = [...WEB2_FEEDS, ...WEB3_FEEDS];

export const encodeScore = (home: number, away: number): number => home * 1000 + away;

/** deterministic field element from a subject string (the public subject/wallet hash). */
export function fieldFromString(s: string): string {
  let acc = 0n;
  for (const ch of s) acc = (acc * 131n + BigInt(ch.charCodeAt(0))) % FIELD;
  return (acc === 0n ? 1n : acc).toString();
}
