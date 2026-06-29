import { useCallback, useState } from "react";
import { useProver, type Circuit, type ProveOutput } from "./useProver.ts";
import { verifyOnChain } from "../soroban.ts";

// 0 idle · 1 sources · 2 aggregate · 3 commit · 4 prove (awaiting confirm) · 5 verify · 6 settled
export const STAGES = ["SOURCES", "AGGREGATE", "COMMIT", "PROVE", "VERIFY"] as const;

export interface RunConfig {
  key: string;
  circuit: Circuit;
  vkId: number;
  payload: unknown;
}

export interface OracleState {
  key: string | null;
  stage: number;
  data: ProveOutput | null;
  verified: boolean | null;
  error: string | null;
  running: boolean;
  pct: number;
  note: string;
}

export interface RunOutcome {
  data: ProveOutput | null;
  verified: boolean | null;
  error: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
const INITIAL: OracleState = {
  key: null, stage: 0, data: null, verified: null, error: null, running: false, pct: 0, note: "",
};

/** Drives the shared pipeline. `prepare` runs sources→aggregate→prove and PAUSES
 *  at PROVE (proof ready, awaiting the user's tx confirmation); `confirm` runs the
 *  on-chain VERIFY with that proof. The pause is where the tx-confirm popup sits. */
export function useOracleRun() {
  const { prove } = useProver();
  const [s, setS] = useState<OracleState>(INITIAL);
  const patch = (p: Partial<OracleState>) => setS((cur) => ({ ...cur, ...p }));

  const prepare = useCallback(
    async (cfg: RunConfig): Promise<ProveOutput | null> => {
      setS({ ...INITIAL, key: cfg.key, running: true, stage: 1, note: "querying sources" });
      try {
        await sleep(460);
        patch({ stage: 2, note: cfg.circuit === "consensus" ? "quorum 2-of-3" : cfg.circuit === "predicate" ? "evaluate predicate" : "f() · Σ records" });
        await sleep(460);
        const ts = nowSec();
        const out = await prove(cfg.circuit, cfg.payload, ts, ts, ({ stage, pct }) =>
          patch({ pct, note: stage, stage: /commit/i.test(stage) ? 3 : /proof|generat/i.test(stage) ? 4 : 3 }),
        );
        patch({ data: out, stage: 4, running: false, note: "proof ready · confirm to verify" });
        return out;
      } catch (e) {
        patch({ error: (e as Error).message, running: false, stage: 0, note: "halted" });
        return null;
      }
    },
    [prove],
  );

  const confirm = useCallback(async (vkId: number, out: ProveOutput): Promise<boolean> => {
    patch({ stage: 5, running: true, note: "pairing_check on-chain" });
    try {
      const verified = await verifyOnChain(out.proof, out.publicSignals, vkId);
      patch({ verified, stage: 6, running: false, note: verified ? "verified" : "rejected" });
      return verified;
    } catch (e) {
      patch({ error: (e as Error).message, running: false, stage: 0 });
      return false;
    }
  }, []);

  const reset = useCallback(() => setS(INITIAL), []);
  return { state: s, prepare, confirm, reset };
}
