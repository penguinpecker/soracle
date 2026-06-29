import { useCallback, useEffect, useState } from "react";
import { readFeed, CFG, type FeedEntry } from "./soroban.ts";
import { FEEDS, encodeScore } from "./lib/feeds.ts";
import { useOracleRun } from "./hooks/useOracleRun.ts";
import LeftRail from "./components/LeftRail.tsx";
import Hero from "./components/Hero.tsx";
import PipelineSpine from "./components/PipelineSpine.tsx";
import FeedRow from "./components/FeedRow.tsx";
import ProverPanel from "./components/ProverPanel.tsx";
import TamperPanel from "./components/TamperPanel.tsx";
import TrustModel from "./components/TrustModel.tsx";
import Footer from "./components/Footer.tsx";

// hero "Run the oracle" default: two sources report 2–1, one reports 1–1 → quorum 2–1
const RUN_DEFAULT = [encodeScore(2, 1), encodeScore(2, 1), encodeScore(1, 1)];

export default function App() {
  const [feeds, setFeeds] = useState<Record<number, FeedEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const { state, run } = useOracleRun();

  const refresh = useCallback(async () => {
    if (!CFG.registryId) {
      setLoading(false);
      return;
    }
    const next: Record<number, FeedEntry | null> = {};
    await Promise.all(
      FEEDS.map(async (f) => {
        try {
          next[f.id] = await readFeed(f.id);
        } catch {
          next[f.id] = null;
        }
      }),
    );
    setFeeds(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-grain" />

      <div className="relative z-10 mx-auto max-w-[1240px] px-5 sm:px-8 grid lg:grid-cols-[236px_1fr] gap-0 lg:gap-12">
        <LeftRail stage={state.stage} verified={state.verified} />

        <main className="min-w-0 pb-20">
          {!CFG.registryId && (
            <div className="mt-8 panel p-5 text-[13px]" style={{ borderColor: "var(--alarm)", color: "var(--alarm)" }}>
              No registry configured — set VITE_SORACLE_REGISTRY_ID.
            </div>
          )}

          <Hero feed1={feeds[1] ?? null} running={state.running} onRun={() => run(RUN_DEFAULT)} />

          <div className="space-y-20">
            <PipelineSpine stage={state.stage} verified={state.verified} pct={state.pct} note={state.note} error={state.error} />

            <section className="relative z-10">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="label">Live feeds</h2>
                <span className="label text-dim">auto-refresh · 10s</span>
              </div>
              <div>
                {FEEDS.map((f, i) => (
                  <FeedRow key={f.id} feed={f} entry={feeds[f.id] ?? null} loading={loading} index={i} />
                ))}
              </div>
            </section>

            <ProverPanel state={state} onProve={run} />
            <TamperPanel />
            <TrustModel />
            <Footer />
          </div>
        </main>
      </div>
    </>
  );
}
