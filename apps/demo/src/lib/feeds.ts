// Feed catalogue: 3 web2 + 3 web3, spanning all three circuit families
// (consensus / derivation / predicate). 4 pull a REAL live source; 2 are
// clearly marked illustrative (sports needs a keyed/CORS-blocked API + a live
// fixture; social needs API keys — neither is honestly doable client-side).

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
  sourceUrl?: string; // shown as a link when live
  chainAddress?: string; // for live web3 feeds
  live: boolean; // true => seeded from a real source on load
  unit: string;
  format: (v: bigint) => string;
  claim: string;
}

const num = (v: bigint) => v.toLocaleString();

export const WEB2_FEEDS: FeedDef[] = [
  {
    id: 1, web: "WEB2", circuit: "consensus", vkId: 1, inputKind: "scores", live: false,
    name: "Football final score", subjectLabel: "illustrative · you set the sources",
    source: "sports APIs (need keys/proxy)", unit: "score",
    format: (v) => `${v / 1000n}–${v % 1000n}`,
    claim: "the score ≥2 of 3 independent sources agree on — no single source can move it",
  },
  {
    id: 3, web: "WEB2", circuit: "derivation", vkId: 2, inputKind: "reputation", live: true,
    name: "Developer reputation", subjectLabel: "github.com/torvalds",
    source: "GitHub public API", sourceUrl: "https://api.github.com/users/torvalds", unit: "rep",
    format: num,
    claim: "reputation = followers + public repos, read live from GitHub and summed in-circuit",
  },
  {
    id: 5, web: "WEB2", circuit: "predicate", vkId: 3, inputKind: "threshold", live: false,
    name: "Creator reach", subjectLabel: "illustrative · you set the metric",
    source: "social API (needs keys/proxy)", unit: "bit",
    format: (v) => (v === 1n ? "ABOVE ✓" : "BELOW"),
    claim: "the follower count clears the threshold — without revealing the exact number",
  },
];

export const WEB3_FEEDS: FeedDef[] = [
  {
    id: 2, web: "WEB3", circuit: "derivation", vkId: 2, inputKind: "records", live: true,
    name: "Wallet net ERC-20 flow", subjectLabel: "vitalik.eth · Ethereum",
    source: "Blockscout · live transfers", sourceUrl: "https://eth.blockscout.com/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", unit: "tokens",
    format: num,
    claim: "net flow = Σ(received − sent) over real on-chain ERC-20 transfers",
  },
  {
    id: 4, web: "WEB3", circuit: "consensus", vkId: 1, inputKind: "prices", live: true,
    name: "ETH / USD spot", subjectLabel: "Coinbase · CoinGecko · Kraken",
    source: "3 live price sources · 2-of-3 quorum", sourceUrl: "https://www.coinbase.com/price/ethereum", unit: "USD",
    format: num,
    claim: "the price ≥2 of 3 independent exchanges agree on (rounded to $5 for quorum)",
  },
  {
    id: 6, web: "WEB3", circuit: "predicate", vkId: 3, inputKind: "threshold", live: true,
    name: "Treasury solvency", subjectLabel: "Ethereum Foundation · Ethereum",
    source: "Blockscout · live balance", sourceUrl: "https://eth.blockscout.com/address/0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAE",
    chainAddress: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAE", unit: "bit",
    format: (v) => (v === 1n ? "SOLVENT ✓" : "BELOW"),
    claim: "the real on-chain balance clears the solvency floor — exact balance stays private",
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
