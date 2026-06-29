import { AnimatePresence, motion } from "motion/react";
import type { FeedDef } from "../lib/feeds.ts";
import type { ProveOutput } from "../hooks/useProver.ts";
import { encodeProof } from "../lib/encoding.ts";

interface Props {
  open: boolean;
  feed: FeedDef | null;
  data: ProveOutput | null;
  wallet: string;
  verifierId: string;
  confirming: boolean;
  recorded: boolean; // true => Freighter signs a recorded tx; false => read-only check
  onConfirm: () => void;
  onReject: () => void;
}

const LABELS: Record<string, string[]> = {
  consensus: ["feed_id", "n_sources", "result", "inputs_commitment", "timestamp", "epoch"],
  derivation: ["feed_id", "subject_hash", "result", "inputs_commitment", "timestamp", "epoch"],
  predicate: ["feed_id", "subject_hash", "predicate_id", "threshold", "outcome_bit", "value_commitment", "timestamp"],
};

const hex = (b: Uint8Array) => {
  const h = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  return "0x" + h.slice(0, 18) + "…" + h.slice(-12);
};
const trunc = (s: string) => (s.length > 22 ? s.slice(0, 12) + "…" + s.slice(-6) : s);

export default function TxConfirmModal({ open, feed, data, wallet, verifierId, confirming, recorded, onConfirm, onReject }: Props) {
  const enc = data ? encodeProof(data.proof) : null;
  const labels = feed ? LABELS[feed.circuit] : [];
  return (
    <AnimatePresence>
      {open && feed && data && enc && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(6,7,10,0.82)", backdropFilter: "blur(3px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="panel panel-scan w-full max-w-lg p-7 relative max-h-[90vh] overflow-auto"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex items-center justify-between">
              <div className="label" style={{ color: "var(--process)" }}>confirm transaction</div>
              <span className="label !text-[9px] border px-1.5 py-0.5" style={{ borderColor: "var(--line)", color: "var(--process)" }}>Groth16 · BN254</span>
            </div>
            <h3 className="font-display font-black text-xl mt-2">Verify proof on-chain</h3>
            <p className="text-[12px] text-muted mt-1.5 leading-relaxed">
              This calls the verifier’s <span className="mono text-text">pairing_check</span> to confirm the proof
              attests {feed.claim}.
            </p>

            {/* tx envelope */}
            <div className="mt-5 border border-line divide-y divide-[var(--line)] text-[11px] mono">
              <Row k="from" v={wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-6)}` : "—"} />
              <Row k="contract" v={`${verifierId.slice(0, 6)}…${verifierId.slice(-6)} · verifier`} />
              <Row k="method" v={`verify(vk_id=${feed.vkId}, proof, public_inputs[${data.publicSignals.length}])`} />
            </div>

            {/* the real proof */}
            <div className="mt-5">
              <div className="label !text-[9px] mb-2" style={{ color: "var(--process)" }}>zero-knowledge proof (the real bytes)</div>
              <div className="border border-line p-3 space-y-1.5 text-[10px] mono">
                <ProofLine k="π.A  (G1, 64B)" v={hex(enc.a)} />
                <ProofLine k="π.B  (G2, 128B)" v={hex(enc.b)} />
                <ProofLine k="π.C  (G1, 64B)" v={hex(enc.c)} />
              </div>
            </div>

            {/* public inputs */}
            <div className="mt-4">
              <div className="label !text-[9px] mb-2">public inputs</div>
              <div className="border border-line p-3 space-y-1 text-[10px] mono">
                {data.publicSignals.map((sig, i) => (
                  <div key={i} className="flex items-baseline gap-3">
                    <span className="text-dim w-28 shrink-0">{labels[i] ?? `sig[${i}]`}</span>
                    <span className="text-muted truncate">{trunc(sig)}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-dim mt-4 leading-relaxed">
              {recorded
                ? "Freighter will ask you to sign — this submits a recorded transaction you can open on Stellar Expert."
                : "Read-only: runs the verifier's pairing_check against live ledger state (no fee, no recorded tx). Connect Freighter to submit a recorded transaction."}
            </p>

            <div className="mt-4 flex gap-3">
              <button onClick={onReject} disabled={confirming} className="flex-1 py-2.5 text-[13px] border border-line text-muted hover:text-text hover:border-dim transition-colors disabled:opacity-40">
                reject
              </button>
              <button
                onClick={onConfirm}
                disabled={confirming}
                className="flex-[2] py-2.5 text-[13px] font-medium border transition-colors disabled:opacity-60"
                style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
              >
                {confirming ? "verifying on-chain…" : "Confirm & verify on-chain"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2">
      <span className="text-dim">{k}</span>
      <span className="text-muted">{v}</span>
    </div>
  );
}
function ProofLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-dim w-28 shrink-0">{k}</span>
      <span className="truncate" style={{ color: "var(--process)" }}>{v}</span>
    </div>
  );
}
