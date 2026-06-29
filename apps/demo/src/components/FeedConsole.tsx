import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FeedDef } from "../lib/feeds.ts";
import { encodeScore, fieldFromString } from "../lib/feeds.ts";
import type { FeedEntry } from "../soroban.ts";
import type { OracleState, RunConfig, RunOutcome } from "../hooks/useOracleRun.ts";
import HeldSignal from "./HeldSignal.tsx";
import CommitmentGrid from "./CommitmentGrid.tsx";

interface Props {
  feed: FeedDef;
  index: number;
  liveEntry: FeedEntry | null;
  wallet: string;
  connecting: boolean;
  active: boolean;
  state: OracleState;
  result: RunOutcome | null;
  onInitiate: (cfg: RunConfig, signMsg: string) => void;
}

const SIGNAL_LABELS_C = ["feed_id", "n_sources", "result", "commitment", "timestamp", "epoch"];
const SIGNAL_LABELS_D = ["feed_id", "subject", "result", "commitment", "timestamp", "epoch"];

function NumStepper({ value, set, step = 1, min = 0 }: { value: number; set: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="flex items-center">
      <button onClick={() => set(Math.max(min, value - step))} className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim">−</button>
      <span className="font-display font-black text-base w-[3.5ch] text-center tabular">{value.toLocaleString()}</span>
      <button onClick={() => set(value + step)} className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim">+</button>
    </div>
  );
}

export default function FeedConsole({
  feed,
  index,
  liveEntry,
  wallet,
  connecting,
  active,
  state,
  result,
  onInitiate,
}: Props) {
  // ---- per-kind inputs ----
  const [scores, setScores] = useState([{ h: 2, a: 1 }, { h: 2, a: 1 }, { h: 1, a: 1 }]);
  const [trades, setTrades] = useState([{ buy: 1200, sell: 1850, fee: 12 }, { buy: 900, sell: 1180, fee: 9 }]);
  const [gh, setGh] = useState({ followers: 228451, repos: 11 });

  // ---- live preview value from the current inputs ----
  const preview = useMemo(() => {
    if (feed.kind === "sports") {
      const enc = scores.map((s) => encodeScore(s.h, s.a));
      const counts = new Map<number, number>();
      enc.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      let best: { v: number; c: number } | null = null;
      counts.forEach((c, v) => { if (c >= 2 && (!best || c > best.c)) best = { v, c }; });
      return best ? { ok: true, value: BigInt((best as { v: number }).v), note: `${(best as any).c} of 3 agree` } : { ok: false, value: 0n, note: "no quorum" };
    }
    if (feed.kind === "pnl") {
      const pnl = trades.reduce((a, t) => a + t.sell - t.buy - t.fee, 0);
      return { ok: pnl >= 0, value: BigInt(pnl), note: pnl >= 0 ? `${trades.length} trades` : "negative — registry would reject" };
    }
    const rep = gh.followers + gh.repos;
    return { ok: true, value: BigInt(rep), note: `${gh.followers.toLocaleString()} followers + ${gh.repos} repos` };
  }, [feed.kind, scores, trades, gh]);

  const buildCfg = (): RunConfig => {
    if (feed.kind === "sports") {
      return { key: feed.kind, circuit: "consensus", vkId: feed.vkId, payload: { values: scores.map((s) => String(encodeScore(s.h, s.a))) } };
    }
    if (feed.kind === "pnl") {
      return {
        key: feed.kind,
        circuit: "derivation",
        vkId: feed.vkId,
        payload: {
          feedId: 2,
          subjectHash: fieldFromString(wallet || feed.subjectLabel),
          records: trades.map((t) => ({ buy: String(t.buy), sell: String(t.sell), fee: String(t.fee) })),
        },
      };
    }
    return {
      key: feed.kind,
      circuit: "derivation",
      vkId: feed.vkId,
      payload: {
        feedId: 3,
        subjectHash: fieldFromString(feed.subjectLabel),
        records: [{ buy: "0", sell: String(gh.followers + gh.repos), fee: "0" }],
      },
    };
  };

  const verified = result?.verified === true;
  const showProgress = active && state.running;
  const showArtifacts = active && !!state.data && state.stage >= 4;
  const signalLabels = feed.circuit === "consensus" ? SIGNAL_LABELS_C : SIGNAL_LABELS_D;

  const initiate = () => {
    onInitiate(buildCfg(), `Soracle · initiate "${feed.name}" (${feed.subjectLabel})`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="panel panel-scan p-6 sm:p-7"
      style={{ borderColor: verified ? "var(--verified)" : "var(--line)" }}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display font-black text-dim text-sm tabular">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-text font-medium">{feed.name}</span>
            <span className="label !text-[9px] border px-1.5 py-0.5" style={{ color: feed.web === "WEB3" ? "var(--process)" : "var(--muted)", borderColor: "var(--line)" }}>{feed.web}</span>
            <span className="label !text-[9px] border px-1.5 py-0.5" style={{ color: "var(--dim)", borderColor: "var(--line)" }}>{feed.circuit}</span>
          </div>
          <div className="text-[12px] text-dim mt-1.5">{feed.subjectLabel} · {feed.source}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-black text-[34px] leading-none tabular" style={{ color: verified ? "var(--verified)" : "var(--text)" }}>
            {preview.ok ? feed.format(preview.value) : "—"}
          </div>
          <div className="label !text-[9px] mt-1.5" style={{ color: verified ? "var(--verified)" : "var(--dim)" }}>
            {verified ? "✓ verified on-chain" : liveEntry ? `on-chain now ${feed.format(liveEntry.value)}` : preview.note}
          </div>
        </div>
      </div>

      <HeldSignal locked={verified} seed={index + 2} width={600} height={34} className="w-full mb-5" />

      <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
        {/* inputs */}
        <div className="space-y-3">
          {feed.kind === "sports" &&
            scores.map((s, i) => (
              <div key={i} className="flex items-center justify-between border border-line px-3 py-2">
                <span className="label">source {String.fromCharCode(65 + i)}</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5"><span className="label !text-[9px]">H</span><NumStepper value={s.h} set={(h) => setScores((c) => c.map((x, j) => (j === i ? { ...x, h } : x)))} /></div>
                  <div className="flex items-center gap-1.5"><span className="label !text-[9px]">A</span><NumStepper value={s.a} set={(a) => setScores((c) => c.map((x, j) => (j === i ? { ...x, a } : x)))} /></div>
                </div>
              </div>
            ))}

          {feed.kind === "pnl" &&
            trades.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border border-line px-3 py-2 flex-wrap">
                <span className="label">trade {i + 1}</span>
                <div className="flex items-center gap-3 text-[12px]">
                  <label className="flex items-center gap-1.5 text-dim">buy<NumStepper value={t.buy} step={100} set={(buy) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, buy } : x)))} /></label>
                  <label className="flex items-center gap-1.5 text-dim">sell<NumStepper value={t.sell} step={100} set={(sell) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, sell } : x)))} /></label>
                  <label className="flex items-center gap-1.5 text-dim">fee<NumStepper value={t.fee} set={(fee) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, fee } : x)))} /></label>
                </div>
              </div>
            ))}

          {feed.kind === "github" && (
            <div className="flex items-center justify-between border border-line px-3 py-2 flex-wrap gap-3">
              <label className="flex items-center gap-2 text-[12px] text-dim">followers<NumStepper value={gh.followers} step={1000} set={(followers) => setGh((g) => ({ ...g, followers }))} /></label>
              <label className="flex items-center gap-2 text-[12px] text-dim">public repos<NumStepper value={gh.repos} set={(repos) => setGh((g) => ({ ...g, repos }))} /></label>
            </div>
          )}

          <div className="text-[12px] mono pt-1" style={{ color: preview.ok ? "var(--process)" : "var(--alarm)" }}>
            {preview.ok ? `→ f() = ${feed.format(preview.value)} · ${preview.note}` : `✗ ${preview.note}`}
          </div>

          <button
            onClick={initiate}
            disabled={showProgress || !preview.ok}
            className="w-full py-2.5 text-[13px] font-medium tracking-wide border transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
          >
            {showProgress
              ? `${state.note}…`
              : connecting
                ? "connecting wallet…"
                : wallet
                  ? `▷ Initiate as ${wallet.slice(0, 4)}…${wallet.slice(-4)}`
                  : "▷ Initiate from wallet"}
          </button>
          {showProgress && (
            <div className="h-1 bg-line overflow-hidden">
              <motion.div className="h-full" style={{ backgroundColor: "var(--process)" }} animate={{ width: `${state.stage === 4 ? state.pct : state.stage * 16}%` }} transition={{ ease: "linear" }} />
            </div>
          )}
          {active && state.error && <div className="mono text-[11px]" style={{ color: "var(--alarm)" }}>{state.error}</div>}
        </div>

        {/* artifacts */}
        <div className="lg:w-[260px] lg:border-l border-line lg:pl-6 min-h-[120px]">
          <AnimatePresence mode="wait">
            {showArtifacts ? (
              <motion.div key="art" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div>
                  <div className="label !text-[9px] mb-1.5">poseidon commitment</div>
                  <CommitmentGrid hex={state.data ? BigInt(state.data.commitment).toString(16).padStart(64, "0") : ""} active={state.stage <= 4} />
                </div>
                <div className="inline-flex items-center gap-2 border px-2 py-1" style={{ borderColor: "var(--line)" }}>
                  <span className="font-display font-black" style={{ color: "var(--process)" }}>π</span>
                  <span className="label !text-[9px]">Groth16</span>
                </div>
                <div className="space-y-0.5">
                  {state.data!.publicSignals.map((sig, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-[10px] mono">
                      <span className="text-dim w-20 shrink-0">{signalLabels[i] ?? `sig[${i}]`}</span>
                      <span className="text-muted truncate">{sig.length > 14 ? sig.slice(0, 8) + "…" + sig.slice(-4) : sig}</span>
                    </div>
                  ))}
                </div>
                {state.stage === 6 && (
                  <div className="mono text-[11px] pt-2 border-t border-line font-medium" style={{ color: state.verified ? "var(--verified)" : "var(--alarm)" }}>
                    pairing_check → {state.verified ? "✓ verified" : "✗ rejected"}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-dim h-full grid place-items-center text-center">
                {result?.verified
                  ? "✓ your proof verified on-chain — edit inputs and re-initiate."
                  : "set the inputs, then initiate from your wallet to prove + verify this feed on-chain."}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
