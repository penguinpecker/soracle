import { motion, type Variants } from "motion/react";
import type { FeedEntry } from "../soroban.ts";
import { FEEDS } from "../lib/feeds.ts";
import HeldSignal from "./HeldSignal.tsx";

interface Props {
  feed1: FeedEntry | null;
  onRun: () => void;
}

const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.06, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] },
  }),
};

export default function Hero({ feed1, onRun }: Props) {
  const f = FEEDS[0];
  return (
    <section className="relative z-10 pt-6 sm:pt-10 pb-14 grid lg:grid-cols-[1.25fr_1fr] gap-10 lg:gap-16 items-center">
      <div>
        <motion.div custom={0} variants={rise} initial="hidden" animate="show" className="label mb-6" style={{ color: "var(--verified)" }}>
          ◦ verifiable oracle · stellar testnet
        </motion.div>
        <h1 className="hero-serif text-[clamp(44px,7vw,88px)]">
          <motion.span custom={1} variants={rise} initial="hidden" animate="show" className="block">
            Don’t trust
          </motion.span>
          <motion.span custom={2} variants={rise} initial="hidden" animate="show" className="block">
            the feed.
          </motion.span>
          <motion.span
            custom={3}
            variants={rise}
            initial="hidden"
            animate="show"
            className="block italic font-normal"
            style={{ color: "var(--verified)" }}
          >
            Verify it.
          </motion.span>
        </h1>
        <motion.p custom={4} variants={rise} initial="hidden" animate="show" className="mt-7 max-w-md text-[15px] text-muted leading-relaxed">
          Every published value ships with a Groth16 proof that it was honestly aggregated
          from its sources. A Soroban contract checks the proof on-chain with the BN254
          pairing&nbsp;check <em className="text-text not-italic">before</em> the value is
          ever stored.
        </motion.p>
        <motion.div custom={5} variants={rise} initial="hidden" animate="show" className="mt-9 flex items-center gap-4">
          <button
            onClick={onRun}
            className="group relative px-6 py-3 text-[13px] font-medium tracking-wide border transition-colors"
            style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
          >
            ▷ Initiate a feed ↓
          </button>
          <a href="#consoles" className="text-[13px] text-muted hover:text-text transition-colors underline underline-offset-4 decoration-line">
            sports · wallet PnL · dev reputation
          </a>
        </motion.div>
      </div>

      {/* hero instrument: feed 1, live */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="panel panel-scan p-7 relative overflow-hidden"
      >
        <div
          className="absolute -top-10 -right-10 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(198,242,78,.10), transparent 70%)" }}
        />
        <div className="flex items-center justify-between">
          <span className="label">{f.name}</span>
          <span className="label !text-[9px]" style={{ color: "var(--process)" }}>{f.circuit}</span>
        </div>
        <div className="mt-6 mb-5 font-display font-black leading-none tabular" style={{ fontSize: 64, color: feed1 ? "var(--verified)" : "var(--dim)" }}>
          {feed1 ? f.format(feed1.value) : "—"}
        </div>
        <HeldSignal locked={!!feed1} seed={1} width={320} height={56} className="w-full" />
        <div className="mt-5 flex items-center justify-between text-[11px] text-dim mono">
          <span>{feed1 ? `epoch ${feed1.epoch}` : "reading…"}</span>
          <span style={{ color: feed1 ? "var(--verified)" : undefined }}>
            {feed1 ? "✓ proof verified on-chain" : ""}
          </span>
        </div>
      </motion.div>
    </section>
  );
}
