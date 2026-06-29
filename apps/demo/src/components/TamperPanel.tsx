import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CFG, simulateTamper } from "../soroban.ts";

type Phase = "idle" | "running" | "rejected" | "error";

export default function TamperPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("");

  const run = useCallback(async () => {
    setPhase("running");
    setDetail("");
    try {
      const r = await simulateTamper(1, 999n);
      setPhase(r.rejected ? "rejected" : "error");
      setDetail(r.detail);
    } catch (e) {
      setPhase("rejected");
      setDetail((e as Error).message);
    }
  }, []);

  return (
    <section className="relative z-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="label">Try to cheat it</h2>
        <span className="label text-dim">live · read-only simulate</span>
      </div>

      <motion.div
        className="panel p-6 sm:p-8"
        style={{ borderColor: phase === "rejected" ? "var(--alarm)" : "var(--line)" }}
        animate={phase === "rejected" ? { x: [0, -7, 7, -7, 7, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <p className="text-[14px] text-muted leading-relaxed max-w-xl">
            Push a <strong className="text-text">spoofed value (999)</strong> to feed 1 with a forged
            proof. We only simulate — no keys — but the registry still runs the verifier’s BN254
            pairing check, so the chain throws it out. Same gate that guards every real value.
          </p>
          <button
            onClick={run}
            disabled={phase === "running" || !CFG.registryId}
            className="px-6 py-3 text-[13px] font-medium tracking-wide border transition-colors disabled:opacity-40 whitespace-nowrap"
            style={{ borderColor: "var(--alarm)", color: "var(--alarm)", background: "var(--alarm-dim)" }}
          >
            {phase === "running" ? "submitting spoof…" : "✗ Attempt to tamper"}
          </button>
        </div>

        <AnimatePresence>
          {phase === "rejected" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 border-t border-line pt-5"
            >
              <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--alarm)" }}>
                ⊘ REJECTED ON-CHAIN — value not stored
              </div>
              <pre className="mono text-[10px] text-dim mt-3 whitespace-pre-wrap break-all max-h-28 overflow-auto">
                {detail}
              </pre>
            </motion.div>
          )}
          {phase === "error" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 mono text-[11px]" style={{ color: "var(--alarm)" }}>
              {detail}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
