import { useCallback, useEffect, useState } from "react";
import { readFeed, submitVerifyFreighter, verifyOnChain, CFG, type FeedEntry } from "./soroban.ts";
import { WEB2_FEEDS, WEB3_FEEDS } from "./lib/feeds.ts";
import { useOracleRun, type RunConfig, type RunOutcome } from "./hooks/useOracleRun.ts";
import { useWallet } from "./hooks/useWallet.ts";
import type { ProveOutput } from "./hooks/useProver.ts";
import type { FeedDef } from "./lib/feeds.ts";
import LeftRail from "./components/LeftRail.tsx";
import Hero from "./components/Hero.tsx";
import PipelineSpine from "./components/PipelineSpine.tsx";
import FeedConsole from "./components/FeedConsole.tsx";
import WalletModal from "./components/WalletModal.tsx";
import TxConfirmModal from "./components/TxConfirmModal.tsx";
import TamperPanel from "./components/TamperPanel.tsx";
import TrustModel from "./components/TrustModel.tsx";
import Footer from "./components/Footer.tsx";

export default function App() {
  const [feed1, setFeed1] = useState<FeedEntry | null>(null);
  const wallet = useWallet();
  const { state, prepare, confirm, reset } = useOracleRun();
  const [results, setResults] = useState<Record<string, RunOutcome>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [pendingCfg, setPendingCfg] = useState<RunConfig | null>(null);
  const [tx, setTx] = useState<{ cfg: RunConfig; feed: FeedDef; data: ProveOutput } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!CFG.registryId) return;
    const load = () => readFeed(1).then(setFeed1).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const feedOf = (key: string): FeedDef => [...WEB2_FEEDS, ...WEB3_FEEDS].find((f) => String(f.id) === key)!;

  // prove -> open tx confirm popup
  const doPrepare = useCallback(
    async (cfg: RunConfig) => {
      setActiveKey(cfg.key);
      const out = await prepare(cfg);
      if (out) setTx({ cfg, feed: feedOf(cfg.key), data: out });
      else setResults((p) => ({ ...p, [cfg.key]: { data: null, verified: null, error: "proving failed" } }));
    },
    [prepare],
  );

  const onInitiate = useCallback(
    (cfg: RunConfig) => {
      if (!wallet.address) { setPendingCfg(cfg); setWalletOpen(true); return; }
      void doPrepare(cfg);
    },
    [wallet.address, doPrepare],
  );

  const onWalletConnected = useCallback(() => {
    setWalletOpen(false);
    if (pendingCfg) { const c = pendingCfg; setPendingCfg(null); void doPrepare(c); }
  }, [pendingCfg, doPrepare]);

  // user confirms the tx -> on-chain verify
  const onConfirmTx = useCallback(async () => {
    if (!tx) return;
    setConfirming(true);
    const { proof, publicSignals } = tx.data;
    // Freighter signs + submits a REAL recorded tx; keyless/demo runs the on-chain
    // read-only check (real verifier execution, no recorded tx).
    const submitFn =
      wallet.via === "freighter"
        ? () => submitVerifyFreighter(proof, publicSignals, tx.cfg.vkId, wallet.address)
        : async () => ({ ok: await verifyOnChain(proof, publicSignals, tx.cfg.vkId) });
    const r = await confirm(submitFn);
    setResults((p) => ({ ...p, [tx.cfg.key]: { data: tx.data, verified: r.verified, hash: r.hash, error: null } }));
    setConfirming(false);
    setTx(null);
  }, [tx, wallet.via, wallet.address, confirm]);

  const onRejectTx = useCallback(() => { setTx(null); setConfirming(false); reset(); }, [reset]);

  const renderConsole = (feed: FeedDef, n: number) => (
    <FeedConsole
      key={feed.id}
      feed={feed}
      n={n}
      wallet={wallet.address}
      active={activeKey === String(feed.id)}
      state={state}
      result={results[String(feed.id)] ?? null}
      onInitiate={onInitiate}
    />
  );

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-grain" />

      <div className="relative z-10 mx-auto max-w-[1240px] px-5 sm:px-8 grid lg:grid-cols-[236px_1fr] gap-0 lg:gap-12">
        <LeftRail stage={state.stage} verified={state.verified} address={wallet.address} busy={wallet.busy} onConnect={() => setWalletOpen(true)} />

        <main className="min-w-0 pb-20">
          {!CFG.registryId && (
            <div className="mt-8 panel p-5 text-[13px]" style={{ borderColor: "var(--alarm)", color: "var(--alarm)" }}>
              No registry configured — set VITE_SORACLE_REGISTRY_ID.
            </div>
          )}

          <Hero feed1={feed1} onRun={() => document.getElementById("consoles")?.scrollIntoView({ behavior: "smooth" })} />

          <div className="space-y-16">
            <PipelineSpine stage={state.stage} verified={state.verified} pct={state.pct} note={state.note} error={state.error} />

            <section id="consoles" className="relative z-10 scroll-mt-6">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="label">Initiate a feed</h2>
                <span className="label text-dim">you drive · proof per feed · real tx</span>
              </div>
              <p className="text-[12px] text-dim mb-5 max-w-2xl leading-relaxed">
                Four feeds carry a <span className="text-muted">live</span> source (GitHub, ETH/USD across 3 exchanges,
                and two on-chain via Blockscout); the two marked <span className="text-muted">illustrative</span> need
                API keys / a backend (sports, social), so you set those values. Either way a green check means the
                proof that the <em className="not-italic text-muted">result follows from the committed inputs</em> verified
                on-chain (open the tx). The ZK proves honest computation, not that the raw inputs are true — that’s the trust model below.
              </p>

              <div className="label !text-[10px] mb-3" style={{ color: "var(--muted)" }}>◦ web2 sources</div>
              <div className="grid md:grid-cols-3 gap-4">{WEB2_FEEDS.map((f, i) => renderConsole(f, i + 1))}</div>

              <div className="label !text-[10px] mb-3 mt-8" style={{ color: "var(--process)" }}>◦ web3 sources</div>
              <div className="grid md:grid-cols-3 gap-4">{WEB3_FEEDS.map((f, i) => renderConsole(f, i + 4))}</div>
            </section>

            <TamperPanel />
            <TrustModel />
            <Footer />
          </div>
        </main>
      </div>

      <WalletModal
        open={walletOpen}
        busy={wallet.busy}
        onClose={() => { setWalletOpen(false); setPendingCfg(null); }}
        onFreighter={wallet.connectFreighter}
        onManual={wallet.connectManual}
        onConnected={onWalletConnected}
      />
      <TxConfirmModal
        open={!!tx}
        feed={tx?.feed ?? null}
        data={tx?.data ?? null}
        wallet={wallet.address}
        verifierId={CFG.verifierId}
        confirming={confirming}
        recorded={wallet.via === "freighter"}
        onConfirm={onConfirmTx}
        onReject={onRejectTx}
      />
    </>
  );
}
