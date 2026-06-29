import { useCallback, useState } from "react";
import { useProver, type Circuit, type ProveOutput } from "./useProver.ts";
import { verifyOnChain } from "../soroban.ts";

// 0 idle · 1 sources · 2 aggregate · 3 commit · 4 prove · 5 verify · 6 settled
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
  key: null,
  stage: 0,
  data: null,
  verified: null,
  error: null,
  running: false,
  pct: 0,
  note: "",
};

/** Drives the shared pipeline visualization through one real prove→verify run. */
export function useOracleRun() {
  const { prove } = useProver();
  const [s, setS] = useState<OracleState>(INITIAL);
  const patch = (p: Partial<OracleState>) => setS((cur) => ({ ...cur, ...p }));

  const run = useCallback(
    async (cfg: RunConfig): Promise<RunOutcome> => {
      setS({ ...INITIAL, key: cfg.key, running: true, stage: 1, note: "querying sources" });
      try {
        await sleep(480);
        patch({ stage: 2, note: cfg.circuit === "consensus" ? "quorum 2-of-3" : "f() · Σ records" });
        await sleep(480);

        const ts = nowSec();
        const out = await prove(cfg.circuit, cfg.payload, ts, ts, ({ stage, pct }) =>
          patch({ pct, note: stage, stage: /commit/i.test(stage) ? 3 : /proof|generat/i.test(stage) ? 4 : 3 }),
        );
        patch({ data: out, stage: 5, note: "pairing_check on-chain" });

        const verified = await verifyOnChain(out.proof, out.publicSignals, cfg.vkId);
        patch({ verified, stage: 6, running: false, note: verified ? "verified" : "rejected" });
        return { data: out, verified, error: null };
      } catch (e) {
        const error = (e as Error).message;
        patch({ error, running: false, stage: 0, note: "halted" });
        return { data: null, verified: null, error };
      }
    },
    [prove],
  );

  return { state: s, run };
}
