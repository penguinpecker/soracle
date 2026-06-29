export default function TrustModel() {
  return (
    <section className="relative z-10">
      <h2 className="label mb-5">Honest trust model</h2>
      <div className="grid sm:grid-cols-2 gap-px bg-line border border-line">
        <div className="bg-panel p-6">
          <div className="font-display text-lg font-semibold mb-2" style={{ color: "var(--verified)" }}>
            What the ZK guarantees
          </div>
          <p className="text-[14px] text-muted leading-relaxed">
            The published value equals the agreed aggregation applied to a committed input set —
            no cherry-picking, no bad math, no silent tampering. For confidential feeds it proves a
            predicate (e.g. <span className="mono text-text">value &gt; N</span>) without revealing the value.
          </p>
        </div>
        <div className="bg-panel p-6">
          <div className="font-display text-lg font-semibold mb-2 text-text">What it doesn’t (alone)</div>
          <p className="text-[14px] text-muted leading-relaxed">
            It doesn’t prove the operator fetched honest raw inputs. We mitigate with
            authenticated chain inputs, multi-source consensus, and an on-chain commitment to the
            exact input set for after-the-fact audit. We say <em className="text-text not-italic">verifiable</em>,
            not “trustless.”
          </p>
        </div>
      </div>
    </section>
  );
}
