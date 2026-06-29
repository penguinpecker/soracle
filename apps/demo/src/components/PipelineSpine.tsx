import { AnimatePresence, motion } from "motion/react";
import { STAGES } from "../hooks/useOracleRun.ts";

interface Props {
  stage: number; // 0..6
  verified: boolean | null;
  pct: number;
  note: string;
  error: string | null;
}

const DESC = [
  "fetch · N independent sources",
  "f() · quorum / derivation",
  "Poseidon · commit to inputs",
  "Groth16 · prove in your browser",
  "BN254 · pairing_check on-chain",
];

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export default function PipelineSpine({ stage, verified, pct, note, error }: Props) {
  const settledOk = stage === 6 && verified === true;
  const settledBad = stage === 6 && verified === false;

  const nodeState = (n: number) => {
    const idx = n + 1;
    const lit = stage >= idx;
    const isVerify = n === 4;
    const done =
      stage > idx || (isVerify && settledOk) || (!isVerify && stage === 6 && verified === true);
    let color = "var(--dim)";
    if (isVerify && settledBad) color = "var(--alarm)";
    else if (settledOk) color = "var(--verified)";
    else if (lit) color = "var(--process)";
    const active = stage === idx && stage < 6;
    return { lit, done, color, active, isVerify };
  };

  return (
    <section className="relative z-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="label">The pipeline</h2>
        <span className="label text-dim">source → proof → on-chain verify → stored</span>
      </div>

      <motion.div
        className="panel panel-scan p-6 sm:p-9"
        animate={settledBad ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.42 }}
      >
        {/* node lane */}
        <div className="flex items-start">
          {STAGES.map((labelText, n) => {
            const st = nodeState(n);
            return (
              <div key={n} className="contents">
                <div className="flex flex-col items-center gap-2.5 shrink-0 w-12 sm:w-16">
                  <motion.div
                    className="relative size-9 grid place-items-center rounded-[3px] border tabular"
                    style={{ borderColor: st.color, color: st.color }}
                    animate={{
                      scale: st.active ? [1, 1.12, 1] : 1,
                      backgroundColor: st.done
                        ? (st.isVerify && settledBad ? "var(--alarm-dim)" : settledOk ? "var(--verified-dim)" : "transparent")
                        : "transparent",
                    }}
                    transition={st.active ? { duration: 1, repeat: Infinity } : { duration: 0.3 }}
                  >
                    {st.done ? (
                      st.isVerify && settledBad ? <Cross /> : <Check />
                    ) : (
                      <span className="font-display font-black text-[15px]">{n + 1}</span>
                    )}
                    {st.active && (
                      <motion.span
                        className="absolute inset-0 rounded-[3px]"
                        style={{ boxShadow: "0 0 0 1px var(--process)" }}
                        animate={{ opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                  <div className="label text-center leading-tight hidden sm:block" style={{ color: st.lit ? st.color : undefined }}>
                    {labelText}
                  </div>
                </div>

                {n < STAGES.length - 1 && (
                  <div className="flex-1 h-px bg-line relative mt-[18px] mx-1 overflow-hidden">
                    <motion.div
                      className="absolute inset-0 origin-left"
                      style={{ backgroundColor: settledOk ? "var(--verified)" : "var(--process)" }}
                      initial={false}
                      animate={{ scaleX: stage >= n + 2 ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* active-stage descriptor (mobile shows it here; desktop too) */}
        <div className="mt-7 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-muted">
            {stage > 0 && stage <= 5 ? (
              <>
                <span className="text-text">{STAGES[Math.min(stage, 5) - 1]}</span>
                <span className="text-dim"> — {note || DESC[Math.min(stage, 5) - 1]}</span>
              </>
            ) : stage === 0 ? (
              <span className="text-dim">idle — press “Run the oracle”.</span>
            ) : null}
          </div>

          {/* prove progress bar (only during prove stage) */}
          {stage === 4 && (
            <div className="w-40 h-1 bg-line overflow-hidden rounded-full">
              <motion.div className="h-full" style={{ backgroundColor: "var(--process)" }} animate={{ width: `${pct}%` }} transition={{ ease: "linear" }} />
            </div>
          )}

          <AnimatePresence>
            {settledOk && (
              <motion.div
                key="ok"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-[13px] font-medium"
                style={{ color: "var(--verified)" }}
              >
                <Check /> proof verified on-chain · value stored
              </motion.div>
            )}
            {settledBad && (
              <motion.div
                key="bad"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-[13px] font-medium"
                style={{ color: "var(--alarm)" }}
              >
                <Cross /> pairing_check returned false · rejected on-chain
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && <div className="mt-3 mono text-[11px]" style={{ color: "var(--alarm)" }}>{error}</div>}
      </motion.div>
    </section>
  );
}
