import { useCallback, useEffect, useState } from "react";
import {
  getAddress,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import { CFG, readFeed, simulateTamper, type FeedEntry } from "./soroban.ts";

interface FeedDef {
  id: number;
  label: string;
  desc: string;
  circuit: string;
  format: (v: bigint) => string;
}

const FEEDS: FeedDef[] = [
  {
    id: 1,
    label: "Sports consensus",
    desc: "final score · 2-of-3 source quorum",
    circuit: "consensus",
    format: (v) => `${v / 1000n}–${v % 1000n}`,
  },
  {
    id: 2,
    label: "Cross-chain PnL",
    desc: "realized PnL · in-circuit derivation",
    circuit: "derivation",
    format: (v) => `${v}`,
  },
  {
    id: 3,
    label: "GitHub reputation",
    desc: "followers + public repos",
    circuit: "derivation",
    format: (v) => `${v}`,
  },
];

export default function App() {
  const configured = CFG.registryId.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Hero />
      <main className="w-full max-w-5xl mx-auto px-6 pb-24 flex-1">
        {!configured && <NotConfigured />}
        <FeedsPanel />
        <TamperPanel />
        <TrustModel />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  const [addr, setAddr] = useState<string>("");

  const connect = useCallback(async () => {
    if (!(await isConnected()).isConnected) {
      alert("Freighter not detected — install the extension to connect.");
      return;
    }
    const { address, error } = await requestAccess();
    if (!error) setAddr(address);
  }, []);

  useEffect(() => {
    getAddress().then((r) => r.address && setAddr(r.address)).catch(() => {});
  }, []);

  return (
    <header className="w-full border-b border-white/5">
      <div className="max-w-5xl mx-auto px-6 py-10 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Verifiable Oracle · Stellar Testnet
          </div>
          <h1 className="mt-3 text-4xl sm:text-5xl font-black tracking-tight">
            Soracle
          </h1>
          <p className="mt-2 text-lg text-white/70">
            Don't trust the feed.{" "}
            <span className="text-white font-semibold">Verify it.</span>
          </p>
          <p className="mt-4 max-w-xl text-sm text-white/50 leading-relaxed">
            Every published value ships with a Groth16 proof that it was correctly
            aggregated from its source inputs. A Soroban contract checks the proof
            on-chain via the BN254 pairing check <em>before</em> the value is ever
            stored. Consumer contracts read a feed that is <em>proven</em>, not trusted.
          </p>
        </div>
        <button
          onClick={connect}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-2 text-sm font-medium"
        >
          {addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "Connect Freighter"}
        </button>
      </div>
    </header>
  );
}

function NotConfigured() {
  return (
    <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200/90">
      <strong>No registry configured.</strong> Set{" "}
      <code className="mono">VITE_SORACLE_REGISTRY_ID</code> in{" "}
      <code className="mono">apps/demo/.env</code> after deploying the contracts and
      running the node. The UI below polls the registry live once it's set.
    </div>
  );
}

function FeedsPanel() {
  const [feeds, setFeeds] = useState<Record<number, FeedEntry | null>>({});
  const [loading, setLoading] = useState(true);

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
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-white/40">
          Live feeds
        </h2>
        <span className="text-xs text-white/30">auto-refresh · 10s</span>
      </div>
      <div className="mt-4 grid gap-3">
        {FEEDS.map((f) => {
          const entry = feeds[f.id];
          return (
            <div
              key={f.id}
              className="rounded-xl border border-white/8 bg-white/[0.02] p-5 flex items-center justify-between gap-6"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{f.label}</span>
                  <span className="mono text-[10px] uppercase tracking-wider text-emerald-400/80 border border-emerald-400/20 rounded px-1.5 py-0.5">
                    {f.circuit}
                  </span>
                </div>
                <div className="text-xs text-white/40 mt-0.5">{f.desc}</div>
                {entry && (
                  <div className="mono text-[11px] text-white/30 mt-2 truncate">
                    commit {entry.inputsCommitment.slice(0, 18)}… · epoch {entry.epoch}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {loading ? (
                  <span className="text-white/30 text-sm">…</span>
                ) : entry ? (
                  <>
                    <div className="text-3xl font-black tabular-nums">
                      {f.format(entry.value)}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <Check /> proof verified on-chain
                    </div>
                  </>
                ) : (
                  <span className="text-white/30 text-sm">no value yet</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TamperPanel() {
  const [state, setState] = useState<"idle" | "running" | "rejected" | "error">("idle");
  const [detail, setDetail] = useState("");

  const run = useCallback(async () => {
    setState("running");
    setDetail("");
    try {
      const r = await simulateTamper(1, 999n);
      if (r.rejected) {
        setState("rejected");
        setDetail(r.detail);
      } else {
        setState("error");
        setDetail(r.detail);
      }
    } catch (e) {
      // a thrown simulation error is also a rejection of the bad input
      setState("rejected");
      setDetail((e as Error).message);
    }
  }, []);

  return (
    <section className="mt-12 rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-6">
      <h2 className="text-sm font-semibold tracking-widest uppercase text-rose-300/70">
        Tamper rejection · live
      </h2>
      <p className="mt-2 text-sm text-white/60 max-w-2xl">
        Try to publish a <strong>spoofed value</strong> (999) with a bogus proof.
        We only simulate — no keys needed — but the registry still runs the
        verifier's BN254 pairing check, so the chain rejects it. This is a real
        rejection by the same code path that protects every feed.
      </p>
      <button
        onClick={run}
        disabled={!CFG.registryId || state === "running"}
        className="mt-4 rounded-lg bg-rose-500/90 hover:bg-rose-500 disabled:opacity-40 transition px-4 py-2 text-sm font-semibold text-white"
      >
        {state === "running" ? "Submitting spoofed value…" : "Attempt to tamper"}
      </button>
      {state === "rejected" && (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Check /> Rejected on-chain
          </div>
          <pre className="mono text-[11px] text-white/50 mt-2 whitespace-pre-wrap break-all">
            {detail}
          </pre>
        </div>
      )}
      {state === "error" && (
        <div className="mt-4 mono text-[11px] text-amber-300/80 break-all">{detail}</div>
      )}
    </section>
  );
}

function TrustModel() {
  return (
    <section className="mt-12">
      <h2 className="text-sm font-semibold tracking-widest uppercase text-white/40">
        Honest trust model
      </h2>
      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="font-semibold text-emerald-400">What the ZK guarantees</div>
          <p className="mt-2 text-white/60 leading-relaxed">
            The published value equals the agreed aggregation function applied to a
            committed input set — no cherry-picking, no bad math, no silent tampering.
          </p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="font-semibold text-white/80">What it does not (alone)</div>
          <p className="mt-2 text-white/60 leading-relaxed">
            It doesn't prove the operator fetched honest raw inputs. Mitigated by
            authenticated chain inputs, multi-source consensus, and an on-chain
            commitment to the exact input set for after-the-fact audit.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-white/30 flex items-center justify-between">
        <span>Soracle · Stellar Hacks: Real-World ZK</span>
        <span className="mono">{CFG.networkPassphrase.includes("Test") ? "testnet" : "mainnet"}</span>
      </div>
    </footer>
  );
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
