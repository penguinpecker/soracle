import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ConnectResult } from "../hooks/useWallet.ts";

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onFreighter: () => Promise<ConnectResult>;
  onManual: (addr: string) => ConnectResult;
  onConnected: () => void;
}

const DEMO_ADDR = "GAK6KQD4GL2V54UXUZDUADRKST4THG2QDKOWSCKIRNZ3VVOMBHM42YE2";

export default function WalletModal({ open, busy, onClose, onFreighter, onManual, onConnected }: Props) {
  const [addr, setAddr] = useState("");
  const [error, setError] = useState("");

  const done = (r: ConnectResult) => {
    if (r.ok) { setError(""); onConnected(); onClose(); }
    else setError(r.error ?? "could not connect");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(6,7,10,0.82)", backdropFilter: "blur(3px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="panel panel-scan w-full max-w-md p-7 relative"
            initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-dim hover:text-text text-lg leading-none">×</button>
            <div className="label" style={{ color: "var(--verified)" }}>connect wallet</div>
            <h3 className="font-display font-black text-2xl mt-2">Initiate as your wallet</h3>
            <p className="text-[13px] text-muted mt-2 leading-relaxed">
              You initiate each feed as this identity. Reads and on-chain verification are
              keyless — no funds move — so any Stellar address works.
            </p>

            <button
              onClick={async () => done(await onFreighter())}
              disabled={busy}
              className="mt-6 w-full py-3 text-[13px] font-medium border transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
            >
              {busy ? "opening Freighter…" : "🔑 Connect Freighter"}
            </button>
            <p className="text-[11px] text-dim mt-2 leading-relaxed">
              Freighter is Stellar’s browser wallet — the ecosystem’s MetaMask
              (<a href="https://freighter.app" target="_blank" rel="noreferrer" className="underline underline-offset-2 decoration-line hover:text-muted">freighter.app</a>).
              Don’t have it? Just use any address below — no install needed.
            </p>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-line" />
              <span className="label !text-[9px]">or use any address</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <div className="flex gap-2">
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="G… Stellar address"
                spellCheck={false}
                className="flex-1 bg-transparent border border-line px-3 py-2 text-[12px] mono text-text outline-none focus:border-dim"
              />
              <button
                onClick={() => done(onManual(addr))}
                className="px-4 py-2 text-[12px] font-medium border border-line text-muted hover:text-text hover:border-dim transition-colors"
              >
                use
              </button>
            </div>
            <button
              onClick={() => { setAddr(DEMO_ADDR); done(onManual(DEMO_ADDR)); }}
              className="mt-3 text-[12px] text-dim hover:text-muted underline underline-offset-4 decoration-line"
            >
              or use a demo address →
            </button>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 mono text-[11px]" style={{ color: "var(--alarm)" }}>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
