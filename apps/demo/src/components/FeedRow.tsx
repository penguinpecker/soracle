import { motion } from "motion/react";
import type { FeedDef } from "../lib/feeds.ts";
import type { FeedEntry } from "../soroban.ts";
import HeldSignal from "./HeldSignal.tsx";
import Odometer from "./Odometer.tsx";

interface Props {
  feed: FeedDef;
  entry: FeedEntry | null;
  loading: boolean;
  index: number;
}

export default function FeedRow({ feed, entry, loading, index }: Props) {
  const proven = !!entry;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
      className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] items-center gap-5 sm:gap-8 py-6 border-b border-line"
    >
      {/* identity */}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-display font-black text-dim text-sm tabular">{String(index + 1).padStart(2, "0")}</span>
          <span className="text-text font-medium truncate">{feed.name}</span>
          <span
            className="label !text-[9px] border px-1.5 py-0.5 rounded-sm"
            style={{ color: "var(--process)", borderColor: "var(--line)" }}
          >
            {feed.circuit}
          </span>
        </div>
        <div className="text-[12px] text-dim mt-1">{feed.source}</div>
        {entry && (
          <div className="mono text-[10px] text-dim mt-2 truncate">
            commit {entry.inputsCommitment.slice(0, 22)}… · epoch {entry.epoch}
          </div>
        )}
      </div>

      {/* held signal */}
      <HeldSignal locked={proven} seed={index + 2} width={220} height={40} className="w-full" />

      {/* value */}
      <div className="text-right min-w-[120px]">
        {loading ? (
          <span className="text-dim text-2xl">···</span>
        ) : entry ? (
          <>
            <div className="font-display font-black text-[40px] leading-none tabular" style={{ color: "var(--verified)" }}>
              {feed.circuit === "consensus" ? (
                feed.format(entry.value)
              ) : (
                <Odometer value={Number(entry.value)} format={(n) => n.toLocaleString()} />
              )}
            </div>
            <div className="label !text-[9px] mt-2" style={{ color: "var(--verified)" }}>
              ✓ verified on-chain
            </div>
          </>
        ) : (
          <span className="text-dim text-sm">no value yet</span>
        )}
      </div>
    </motion.div>
  );
}
