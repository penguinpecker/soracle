import { useCallback, useEffect, useState } from "react";
import { readFeed, CFG, type FeedEntry } from "./soroban.ts";
import { FEEDS } from "./lib/feeds.ts";
import { useOracleRun, type RunConfig, type RunOutcome } from "./hooks/useOracleRun.ts";
import { useWallet } from "./hooks/useWallet.ts";
import LeftRail from "./components/LeftRail.tsx";
import Hero from "./components/Hero.tsx";
import PipelineSpine from "./components/PipelineSpine.tsx";
import FeedConsole from "./components/FeedConsole.tsx";
import TamperPanel from "./components/TamperPanel.tsx";
import TrustModel from "./components/TrustModel.tsx";
import Footer from "./components/Footer.tsx";

export default function App() {
  const [feeds, setFeeds] = useState<Record<number, FeedEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const wallet = useWallet();
  const { state, run } = useOracleRun();
  const [results, setResults] = useState<Record<string, RunOutcome>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);

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
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const onInitiate = useCallback(
    async (cfg: RunConfig, signMsg: string) => {
      setActiveKey(cfg.key);
      // prefer wallet initiation: connect if needed, then sign the request.
      // Falls back to guest mode (Freighter absent) — all chain calls stay keyless.
      let addr = wallet.address;
      if (!addr && !wallet.unavailable) addr = await wallet.connect();
      if (addr) await wallet.authorize(signMsg);
      const out = await run(cfg);
      setResults((prev) => ({ ...prev, [cfg.key]: out }));
    },
    [wallet, run],
  );

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-grain" />

      <div className="relative z-10 mx-auto max-w-[1240px] px-5 sm:px-8 grid lg:grid-cols-[236px_1fr] gap-0 lg:gap-12">
        <LeftRail stage={state.stage} verified={state.verified} address={wallet.address} connecting={wallet.connecting} onConnect={wallet.connect} />

        <main className="min-w-0 pb-20">
          {!CFG.registryId && (
            <div className="mt-8 panel p-5 text-[13px]" style={{ borderColor: "var(--alarm)", color: "var(--alarm)" }}>
              No registry configured — set VITE_SORACLE_REGISTRY_ID.
            </div>
          )}

          <Hero feed1={feeds[1] ?? null} onRun={() => document.getElementById("consoles")?.scrollIntoView({ behavior: "smooth" })} />

          <div className="space-y-20">
            <PipelineSpine stage={state.stage} verified={state.verified} pct={state.pct} note={state.note} error={state.error} />

            <section id="consoles" className="relative z-10 scroll-mt-6">
              <div className="flex items-baseline justify-between mb-5">
                <h2 className="label">Initiate a feed</h2>
                <span className="label text-dim">web2 + web3 · you drive · proof per feed</span>
              </div>
              <div className="space-y-4">
                {FEEDS.map((f, i) => (
                  <FeedConsole
                    key={f.id}
                    feed={f}
                    index={i}
                    liveEntry={feeds[f.id] ?? null}
                    wallet={wallet.address}
                    connecting={wallet.connecting}
                    active={activeKey === f.kind}
                    state={state}
                    result={results[f.kind] ?? null}
                    onInitiate={onInitiate}
                  />
                ))}
              </div>
              {loading && <div className="text-dim text-[12px] mt-4">reading on-chain feeds…</div>}
            </section>

            <TamperPanel />
            <TrustModel />
            <Footer />
          </div>
        </main>
      </div>
    </>
  );
}
