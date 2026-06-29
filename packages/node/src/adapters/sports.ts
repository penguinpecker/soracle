// Hero feed 1 — sports-score consensus (consensus.circom).
// Fetches the SAME fixture's final score from N independent JSON sports APIs,
// requires a 2/3 quorum, and proves the published score is the quorum value.
// A single bad/lagging source cannot move the feed.
import { commitValues, consensus } from "../aggregate.js";
import { DEMO_SALT, type Adapter, type Tick } from "./types.js";

/** encode a final score as a single field value: home*1000 + away (< 1000 each). */
const encodeScore = (home: number, away: number): bigint => BigInt(home * 1000 + away);

export interface SportsSource {
  name: string;
  /** "espn" | "thesportsdb" | "demo" */
  type: string;
  /** provider-specific event/fixture id (or a [home,away] pair for demo). */
  event: string;
  league?: string;
  sport?: string;
  demoScore?: [number, number];
}

export interface SportsConfig {
  feedId: string;
  feedNumericId: number;
  refreshSeconds: number;
  quorum: number; // k of N
  sources: SportsSource[]; // exactly 3 for the default circuit (N=3)
}

async function fetchScore(s: SportsSource): Promise<bigint> {
  switch (s.type) {
    case "demo": {
      const [h, a] = s.demoScore ?? [0, 0];
      return encodeScore(h, a);
    }
    case "espn": {
      // keyless ESPN summary endpoint
      const sport = s.sport ?? "soccer";
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${s.league}/summary?event=${s.event}`;
      const raw: any = await getJson(url);
      const comp = raw?.header?.competitions?.[0]?.competitors ?? raw?.competitions?.[0]?.competitors;
      const home = Number(comp?.find((c: any) => c.homeAway === "home")?.score ?? 0);
      const away = Number(comp?.find((c: any) => c.homeAway === "away")?.score ?? 0);
      return encodeScore(home, away);
    }
    case "thesportsdb": {
      // free test key "3"
      const url = `https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${s.event}`;
      const raw: any = await getJson(url);
      const ev = raw?.events?.[0];
      return encodeScore(Number(ev?.intHomeScore ?? 0), Number(ev?.intAwayScore ?? 0));
    }
    default:
      throw new Error(`unknown sports source type: ${s.type}`);
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export function sportsAdapter(cfg: SportsConfig): Adapter {
  const N = cfg.sources.length;
  return {
    feedId: cfg.feedId,
    feedNumericId: cfg.feedNumericId,
    circuit: "consensus",
    refreshSeconds: cfg.refreshSeconds,
    async registerAux1() {
      return BigInt(N); // n_sources
    },
    async tick(epoch: number): Promise<Tick | null> {
      const values: bigint[] = [];
      for (const s of cfg.sources) {
        try {
          values.push(await fetchScore(s));
        } catch (e) {
          console.warn(`[${cfg.feedId}] source ${s.name} failed: ${(e as Error).message}`);
        }
      }
      if (values.length !== N) {
        return null; // need all N source values to prove the N-input circuit
      }
      const agreed = consensus(values, cfg.quorum);
      if (!agreed) {
        console.log(`[${cfg.feedId}] no quorum (${values.join(",")}) — no update`);
        return null;
      }
      const inputsCommitment = await commitValues(values, DEMO_SALT);
      const timestamp = nowSeconds();
      const witness = {
        feed_id: BigInt(cfg.feedNumericId).toString(),
        n_sources: BigInt(N).toString(),
        result: agreed.result.toString(),
        inputs_commitment: inputsCommitment.toString(),
        timestamp: BigInt(timestamp).toString(),
        epoch: BigInt(epoch).toString(),
        values: values.map(String),
        salt: DEMO_SALT.toString(),
      };
      return {
        circuit: "consensus",
        value: agreed.result,
        inputsCommitment,
        aux1: BigInt(N),
        witness,
        timestamp,
        epoch,
        note: `quorum ${agreed.quorum}/${N} on ${agreed.result}`,
      };
    },
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
