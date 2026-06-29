import { useCallback, useEffect, useState } from "react";
import { getAddress, isConnected, requestAccess } from "@stellar/freighter-api";
import { STAGES } from "../hooks/useOracleRun.ts";

interface Props {
  stage: number;
  verified: boolean | null;
}

export default function LeftRail({ stage, verified }: Props) {
  const [addr, setAddr] = useState("");

  const connect = useCallback(async () => {
    try {
      if (!(await isConnected()).isConnected) {
        alert("Freighter not detected — it's optional here (all calls are read-only).");
        return;
      }
      const r = await requestAccess();
      if (!r.error) setAddr(r.address);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    getAddress().then((r) => r.address && setAddr(r.address)).catch(() => {});
  }, []);

  return (
    <aside className="lg:sticky lg:top-0 lg:h-screen flex lg:flex-col justify-between py-6 lg:py-8 lg:pr-8 lg:border-r border-line">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: "var(--verified)", boxShadow: "0 0 8px var(--verified)" }} />
          <span className="font-display font-black text-xl tracking-tight">Soracle</span>
        </div>

        {/* stepper — desktop only */}
        <nav className="hidden lg:block mt-12">
          {STAGES.map((s, i) => {
            const idx = i + 1;
            const lit = stage >= idx;
            const ok = stage === 6 && verified === true;
            const bad = stage === 6 && verified === false && idx === 5;
            const color = bad ? "var(--alarm)" : ok && lit ? "var(--verified)" : lit ? "var(--process)" : "var(--dim)";
            return (
              <div key={s} className="flex items-center gap-3 py-2">
                <span className="font-display font-black text-sm tabular w-5" style={{ color }}>
                  {idx}
                </span>
                <span className="label" style={{ color: lit ? color : "var(--dim)" }}>
                  {s}
                </span>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:block text-[11px] mono text-dim space-y-3">
        <div>
          <div className="label !text-[9px] mb-1">network</div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: "var(--process)" }} />
            testnet
          </div>
          <div className="text-dim/80 break-all">soroban-testnet.stellar.org</div>
        </div>
        <button
          onClick={connect}
          className="w-full text-left border border-line px-3 py-2 hover:border-dim transition-colors"
        >
          {addr ? `◦ ${addr.slice(0, 4)}…${addr.slice(-4)}` : "connect freighter →"}
        </button>
      </div>
    </aside>
  );
}
