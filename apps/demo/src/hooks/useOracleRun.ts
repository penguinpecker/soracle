import { useCallback, useState } from "react";
import { useProver, type ProveOutput } from "./useProver.ts";
import { verifyOnChain } from "../soroban.ts";

// Pipeline stages (index = how far the spine has lit up):
// 0 idle · 1 sources · 2 aggregate · 3 commit · 4 prove · 5 verify · 6 settled
export const STAGES = ["SOURCES", "AGGREGATE", "COMMIT", "PROVE", "VERIFY"] as const;

export interface OracleState {
  stage: number;
  data: ProveOutput | null;
  verified: boolean | null;
  error: string | null;
  running: boolean;
  pct: number;
  note: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

const INITIAL: OracleState = {
  stage: 0,
  data: null,
  verified: null,
  error: null,
  running: false,
  pct: 0,
  note: "",
};

/** Owns the real fetch→aggregate→prove→verify run that drives the visualization. */
export function useOracleRun() {
  const { prove } = useProver();
  const [s, setS] = useState<OracleState>(INITIAL);
  const patch = (p: Partial<OracleState>) => setS((cur) => ({ ...cur, ...p }));

  const run = useCallback(
    async (values: number[]) => {
      setS({ ...INITIAL, running: true, stage: 1, note: "querying sources" });
      try {
        await sleep(520);
        patch({ stage: 2, note: "quorum 2-of-3" });
        await sleep(520);

        const ts = nowSec();
        const out = await prove(values, ts, ts, ({ stage, pct }) => {
          patch({
            pct,
            note: stage,
            stage: /commit/i.test(stage) ? 3 : /proof|generat/i.test(stage) ? 4 : 3,
          });
        });
        patch({ data: out, stage: 5, note: "pairing_check on-chain" });

        const ok = await verifyOnChain(out.proof, out.publicSignals);
        patch({ verified: ok, stage: 6, running: false, note: ok ? "verified" : "rejected" });
      } catch (e) {
        patch({ error: (e as Error).message, running: false, stage: 0, note: "halted" });
      }
    },
    [prove],
  );

  /** Re-run with one public input tampered so the on-chain check returns false. */
  const runTampered = useCallback(
    async (values: number[]) => {
      setS({ ...INITIAL, running: true, stage: 1, note: "querying sources" });
      try {
        await sleep(420);
        patch({ stage: 2 });
        await sleep(420);
        const ts = nowSec();
        const out = await prove(values, ts, ts, ({ stage, pct }) =>
          patch({ pct, note: stage, stage: /commit/i.test(stage) ? 3 : 4 }),
        );
        // tamper: bump the published `result` public signal (index 2) by 1
        const tampered = [...out.publicSignals];
        tampered[2] = (BigInt(tampered[2]) + 1n).toString();
        patch({ data: { ...out, publicSignals: tampered }, stage: 5, note: "pairing_check on-chain" });
        const ok = await verifyOnChain(out.proof, tampered);
        patch({ verified: ok, stage: 6, running: false, note: ok ? "verified" : "rejected" });
      } catch (e) {
        patch({ error: (e as Error).message, running: false, stage: 0, note: "halted" });
      }
    },
    [prove],
  );

  const reset = useCallback(() => setS(INITIAL), []);
  return { state: s, run, runTampered, reset };
}
