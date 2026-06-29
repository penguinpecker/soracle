import { useCallback, useEffect, useRef } from "react";
import type { SnarkProof } from "../lib/encoding.ts";

export interface ProveOutput {
  result: string;
  commitment: string;
  proof: SnarkProof;
  publicSignals: string[];
}
export type OnProgress = (p: { stage: string; pct: number }) => void;

/** Lazily spins up the proving Web Worker and runs one proof per call. */
export function useProver() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../prover.worker.ts", import.meta.url), {
        type: "module",
      });
    }
    return workerRef.current;
  }, []);

  const prove = useCallback(
    (values: number[], ts: number, epoch: number, onProgress?: OnProgress): Promise<ProveOutput> =>
      new Promise((resolve, reject) => {
        const w = getWorker();
        const onMsg = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === "progress") onProgress?.({ stage: m.stage, pct: m.pct });
          else if (m.type === "done") {
            w.removeEventListener("message", onMsg);
            resolve(m as ProveOutput);
          } else if (m.type === "error") {
            w.removeEventListener("message", onMsg);
            reject(new Error(m.message));
          }
        };
        w.addEventListener("message", onMsg);
        w.postMessage({ values: values.map(String), timestamp: ts, epoch });
      }),
    [getWorker],
  );

  return { prove };
}
