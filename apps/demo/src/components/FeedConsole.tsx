import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { FeedDef } from "../lib/feeds.ts";
import { encodeScore, fieldFromString } from "../lib/feeds.ts";
import type { OracleState, RunConfig, RunOutcome } from "../hooks/useOracleRun.ts";
import HeldSignal from "./HeldSignal.tsx";

interface Props {
  feed: FeedDef;
  n: number;
  wallet: string;
  active: boolean;
  state: OracleState;
  result: RunOutcome | null;
  onInitiate: (cfg: RunConfig) => void;
}

function Stepper({ value, set, step = 1, min = 0, w = "3ch" }: { value: number; set: (v: number) => void; step?: number; min?: number; w?: string }) {
  return (
    <div className="flex items-center">
      <button onClick={() => set(Math.max(min, value - step))} className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim">−</button>
      <span className="font-display font-black text-base text-center tabular" style={{ width: w }}>{value.toLocaleString()}</span>
      <button onClick={() => set(value + step)} className="size-6 grid place-items-center border border-line text-muted hover:text-text hover:border-dim">+</button>
    </div>
  );
}

const quorumOf = (vals: number[]) => {
  const c = new Map<number, number>();
  vals.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
  let best: { v: number; c: number } | null = null;
  c.forEach((cc, v) => { if (cc >= 2 && (!best || cc > best.c)) best = { v, c: cc }; });
  return best as { v: number; c: number } | null;
};

export default function FeedConsole({ feed, n, wallet, active, state, result, onInitiate }: Props) {
  const k = feed.inputKind;
  const [scores, setScores] = useState([{ h: 2, a: 1 }, { h: 2, a: 1 }, { h: 1, a: 1 }]);
  const [prices, setPrices] = useState([3200, 3200, 3198]);
  const [gh, setGh] = useState({ followers: 228451, repos: 11 });
  const [trades, setTrades] = useState([{ buy: 1200, sell: 1850, fee: 12 }, { buy: 900, sell: 1180, fee: 9 }]);
  const [thr, setThr] = useState(feed.id === 6 ? { value: 540000, threshold: 250000 } : { value: 142000, threshold: 100000 });

  const preview = useMemo(() => {
    if (k === "scores") { const q = quorumOf(scores.map((s) => encodeScore(s.h, s.a))); return q ? { ok: true, value: BigInt(q.v), note: `${q.c} of 3 agree` } : { ok: false, value: 0n, note: "no quorum" }; }
    if (k === "prices") { const q = quorumOf(prices); return q ? { ok: true, value: BigInt(q.v), note: `${q.c} of 3 agree` } : { ok: false, value: 0n, note: "no quorum" }; }
    if (k === "reputation") { const r = gh.followers + gh.repos; return { ok: true, value: BigInt(r), note: `${gh.followers.toLocaleString()} + ${gh.repos}` }; }
    if (k === "records") { const p = trades.reduce((a, t) => a + t.sell - t.buy - t.fee, 0); return { ok: p >= 0, value: BigInt(p), note: p >= 0 ? `${trades.length} trades` : "negative" }; }
    const out = thr.value > thr.threshold ? 1n : 0n; return { ok: true, value: out, note: `private · vs ${thr.threshold.toLocaleString()}` };
  }, [k, scores, prices, gh, trades, thr]);

  const buildCfg = (): RunConfig => {
    const key = String(feed.id);
    if (k === "scores") return { key, circuit: "consensus", vkId: 1, payload: { values: scores.map((s) => String(encodeScore(s.h, s.a))) } };
    if (k === "prices") return { key, circuit: "consensus", vkId: 1, payload: { values: prices.map(String) } };
    if (k === "reputation") return { key, circuit: "derivation", vkId: 2, payload: { feedId: 3, subjectHash: fieldFromString(feed.subjectLabel), records: [{ buy: "0", sell: String(gh.followers + gh.repos), fee: "0" }] } };
    if (k === "records") return { key, circuit: "derivation", vkId: 2, payload: { feedId: 2, subjectHash: fieldFromString(wallet || feed.subjectLabel), records: trades.map((t) => ({ buy: String(t.buy), sell: String(t.sell), fee: String(t.fee) })) } };
    return { key, circuit: "predicate", vkId: 3, payload: { feedId: feed.id, subjectHash: fieldFromString(feed.subjectLabel), predicateId: 1, value: String(thr.value), threshold: String(thr.threshold) } };
  };

  const verified = result?.verified === true;
  const inFlight = active && state.stage >= 1 && state.stage <= 5;
  const awaiting = active && state.stage === 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="panel panel-scan p-5 sm:p-6" style={{ borderColor: verified ? "var(--verified)" : "var(--line)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-black text-dim text-xs tabular">{String(n).padStart(2, "0")}</span>
            <span className="text-text font-medium text-[15px]">{feed.name}</span>
            <span className="label !text-[9px] border px-1 py-0.5" style={{ color: "var(--dim)", borderColor: "var(--line)" }}>{feed.circuit}</span>
          </div>
          <div className="text-[11px] text-dim mt-1">{feed.subjectLabel}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-black text-[26px] leading-none tabular" style={{ color: verified ? "var(--verified)" : "var(--text)" }}>
            {preview.ok ? feed.format(preview.value) : "—"}
          </div>
          <div className="label !text-[9px] mt-1" style={{ color: verified ? "var(--verified)" : result?.verified === false ? "var(--alarm)" : "var(--dim)" }}>
            {verified ? "✓ verified on-chain" : result?.verified === false ? "✗ rejected" : feed.unit}
          </div>
        </div>
      </div>

      <HeldSignal locked={verified} seed={feed.id + 2} width={560} height={28} className="w-full mb-4" />

      {/* inputs */}
      <div className="space-y-2 mb-3">
        {k === "scores" && scores.map((s, i) => (
          <div key={i} className="flex items-center justify-between border border-line px-2.5 py-1.5">
            <span className="label !text-[9px]">source {String.fromCharCode(65 + i)}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1"><span className="label !text-[9px]">H</span><Stepper value={s.h} set={(h) => setScores((c) => c.map((x, j) => (j === i ? { ...x, h } : x)))} w="2ch" /></div>
              <div className="flex items-center gap-1"><span className="label !text-[9px]">A</span><Stepper value={s.a} set={(a) => setScores((c) => c.map((x, j) => (j === i ? { ...x, a } : x)))} w="2ch" /></div>
            </div>
          </div>
        ))}
        {k === "prices" && prices.map((p, i) => (
          <div key={i} className="flex items-center justify-between border border-line px-2.5 py-1.5">
            <span className="label !text-[9px]">oracle {String.fromCharCode(65 + i)}</span>
            <Stepper value={p} step={1} set={(v) => setPrices((c) => c.map((x, j) => (j === i ? v : x)))} w="5ch" />
          </div>
        ))}
        {k === "reputation" && (
          <div className="flex items-center justify-between border border-line px-2.5 py-1.5 flex-wrap gap-2">
            <label className="flex items-center gap-2 text-[11px] text-dim">followers<Stepper value={gh.followers} step={1000} set={(followers) => setGh((g) => ({ ...g, followers }))} w="6ch" /></label>
            <label className="flex items-center gap-2 text-[11px] text-dim">repos<Stepper value={gh.repos} set={(repos) => setGh((g) => ({ ...g, repos }))} w="3ch" /></label>
          </div>
        )}
        {k === "records" && trades.map((t, i) => (
          <div key={i} className="flex items-center justify-between gap-2 border border-line px-2.5 py-1.5 flex-wrap text-[11px] text-dim">
            <span className="label !text-[9px]">trade {i + 1}</span>
            <label className="flex items-center gap-1">buy<Stepper value={t.buy} step={50} set={(buy) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, buy } : x)))} w="5ch" /></label>
            <label className="flex items-center gap-1">sell<Stepper value={t.sell} step={50} set={(sell) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, sell } : x)))} w="5ch" /></label>
            <label className="flex items-center gap-1">fee<Stepper value={t.fee} set={(fee) => setTrades((c) => c.map((x, j) => (j === i ? { ...x, fee } : x)))} w="3ch" /></label>
          </div>
        ))}
        {k === "threshold" && (
          <>
            <div className="flex items-center justify-between border border-line px-2.5 py-1.5">
              <span className="label !text-[9px]" style={{ color: "var(--process)" }}>metric · private 🔒</span>
              <Stepper value={thr.value} step={5000} set={(value) => setThr((t) => ({ ...t, value }))} w="7ch" />
            </div>
            <div className="flex items-center justify-between border border-line px-2.5 py-1.5">
              <span className="label !text-[9px]">public threshold</span>
              <Stepper value={thr.threshold} step={5000} set={(threshold) => setThr((t) => ({ ...t, threshold }))} w="7ch" />
            </div>
          </>
        )}
      </div>

      <div className="text-[11px] mono mb-3" style={{ color: preview.ok ? "var(--process)" : "var(--alarm)" }}>
        {preview.ok ? `→ f() = ${feed.format(preview.value)} · ${preview.note}` : `✗ ${preview.note}`}
      </div>

      <button
        onClick={() => onInitiate(buildCfg())}
        disabled={inFlight || !preview.ok}
        className="w-full py-2 text-[12px] font-medium tracking-wide border transition-colors disabled:opacity-40"
        style={{ borderColor: "var(--verified)", color: "var(--verified)", background: "var(--verified-dim)" }}
      >
        {inFlight ? (awaiting ? "awaiting confirmation…" : `${state.note}…`) : wallet ? `▷ Initiate as ${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "🔑 Initiate from wallet"}
      </button>
      {inFlight && (
        <div className="h-0.5 bg-line overflow-hidden mt-2">
          <motion.div className="h-full" style={{ backgroundColor: "var(--process)" }} animate={{ width: `${state.stage === 4 ? 100 : state.stage === 5 ? 92 : state.pct || state.stage * 18}%` }} transition={{ ease: "linear" }} />
        </div>
      )}
      {active && state.error && <div className="mono text-[10px] mt-2" style={{ color: "var(--alarm)" }}>{state.error}</div>}
    </motion.div>
  );
}
