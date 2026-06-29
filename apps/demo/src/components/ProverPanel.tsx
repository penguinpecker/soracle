import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { OracleState } from "../hooks/useOracleRun.ts";
import { encodeScore } from "../lib/feeds.ts";
import CommitmentGrid from "./CommitmentGrid.tsx";

interface Props {
  state: OracleState;
  onProve: (values: number[]) => void;
}

interface Score {
  h: number;
  a: number;
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label !text-[9px] w-3">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim transition-colors"
      >
        −
      </button>
      <span className="font-display font-black text-lg w-5 text-center tabular">{value}</span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim transition-colors"
      >
        +
      </button>
    </div>
  );
}

const SIGNAL_LABELS = ["feed_id", "n_sources", "result", "inputs_commitment", "timestamp", "epoch"];

export default function ProverPanel({ state, onProve }: Props) {
  const [scores, setScores] = useState<Score[]>([
    { h: 2, a: 1 },
    { h: 2, a: 1 },
    { h: 1, a: 1 },
  ]);

  const encoded = scores.map((s) => encodeScore(s.h, s.a));
  const quorum = useMemo(() => {
    const counts = new Map<number, number>();
    encoded.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    let best: { v: number; c: number } | null = null;
    counts.forEach((c, v) => {
      if (c >= 2 && (!best || c > best.c)) best = { v, c };
    });
    return best as { v: number; c: number } | null;
  }, [encoded.join(",")]);

  const setScore = (i: number, patch: Partial<Score>) =>
    setScores((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const data = state.data;
  const commitmentHex = data ? BigInt(data.commitment).toString(16).padStart(64, "0") : "";
  const showArtifacts = !!data && state.stage >= 4;

  return (
    <section id="prover" className="relative z-10 scroll-mt-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="label">Prove it yourself</h2>
        <span className="label text-dim">real Groth16 · in your browser</span>
      </div>

      <div className="panel panel-scan p-6 sm:p-8 grid lg:grid-cols-[340px_1fr] gap-8">
        {/* inputs */}
        <div>
          <p className="text-[13px] text-muted leading-relaxed mb-5">
            Set what each of three independent sources reports for a match. The oracle
            publishes only the score <strong className="text-text">at least two</strong> agree on
            (quorum 2-of-3), then proves it.
          </p>
          <div className="space-y-3">
            {scores.map((s, i) => (
              <div key={i} className="flex items-center justify-between border border-line px-3 py-2.5">
                <span className="label">source {String.fromCharCode(65 + i)}</span>
                <div className="flex items-center gap-4">
                  <Stepper label="H" value={s.h} onChange={(h) => setScore(i, { h })} />
                  <Stepper label="A" value={s.a} onChange={(a) => setScore(i, { a })} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 text-[12px] mono">
            {quorum ? (
              <span style={{ color: "var(--process)" }}>
                ✓ quorum — {quorum.c} of 3 report {Math.floor(quorum.v / 1000)}–{quorum.v % 1000}
              </span>
            ) : (
              <span style={{ color: "var(--alarm)" }}>✗ no quorum — the oracle refuses to publish</span>
            )}
          </div>

          <button
            onClick={() => onProve(encoded)}
            disabled={state.running || !quorum}
            className="mt-5 w-full py-3 text-[13px] font-medium tracking-wide border transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
          >
            {state.running ? `${state.note}…` : "▷ Prove + verify on-chain"}
          </button>
        </div>

        {/* artifacts */}
        <div className="border-t lg:border-t-0 lg:border-l border-line pt-6 lg:pt-0 lg:pl-8 min-h-[260px]">
          <AnimatePresence mode="wait">
            {!showArtifacts ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full grid place-items-center text-center"
              >
                <div className="text-dim text-[13px] max-w-[260px]">
                  The proof and its on-chain verdict appear here. Nothing is precomputed —
                  snarkjs runs in a Web Worker on your machine.
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="artifacts"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-5"
              >
                {/* commitment */}
                <div>
                  <div className="label !text-[9px] mb-2">poseidon input commitment</div>
                  <CommitmentGrid hex={commitmentHex} active={state.stage <= 4} />
                </div>

                {/* proof cartridge */}
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 18 }}
                  className="inline-flex items-center gap-3 border px-3 py-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="font-display font-black text-lg" style={{ color: "var(--process)" }}>π</span>
                  <span className="label !text-[9px]">Groth16</span>
                  <span className="mono text-[10px] text-dim">A·64 B·128 C·64 bytes</span>
                </motion.div>

                {/* public signals */}
                <div>
                  <div className="label !text-[9px] mb-2">public signals → verifier</div>
                  <div className="space-y-1">
                    {data!.publicSignals.map((sig, i) => (
                      <div key={i} className="flex items-baseline gap-3 text-[11px] mono">
                        <span className="text-dim w-32 shrink-0">{SIGNAL_LABELS[i] ?? `sig[${i}]`}</span>
                        <span className="text-muted truncate">
                          {sig.length > 18 ? sig.slice(0, 10) + "…" + sig.slice(-6) : sig}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* verdict */}
                <AnimatePresence>
                  {state.stage === 6 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mono text-[12px] pt-2 border-t border-line"
                    >
                      <div className="text-dim">e(−A,B)·e(α,β)·e(vk_x,γ)·e(C,δ) {state.verified ? "= 1" : "≠ 1"}</div>
                      <div className="mt-1.5 font-medium" style={{ color: state.verified ? "var(--verified)" : "var(--alarm)" }}>
                        pairing_check → {state.verified ? "✓ verified on-chain" : "✗ rejected"}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
