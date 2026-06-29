import { CFG } from "../soroban.ts";

const EXPERT = "https://stellar.expert/explorer/testnet/contract/";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-8 pt-8 border-t border-line">
      <div className="grid sm:grid-cols-2 gap-6 text-[11px] mono text-dim">
        <div className="space-y-1.5">
          <div className="label !text-[9px]">contracts · testnet</div>
          <div>
            registry{" "}
            <a className="text-muted hover:text-text underline underline-offset-2 decoration-line break-all" href={EXPERT + CFG.registryId} target="_blank" rel="noreferrer">
              {CFG.registryId.slice(0, 6)}…{CFG.registryId.slice(-4)}
            </a>
          </div>
          <div>
            verifier{" "}
            <a className="text-muted hover:text-text underline underline-offset-2 decoration-line break-all" href={EXPERT + CFG.verifierId} target="_blank" rel="noreferrer">
              {CFG.verifierId.slice(0, 6)}…{CFG.verifierId.slice(-4)}
            </a>
          </div>
        </div>
        <div className="sm:text-right space-y-1.5">
          <div className="label !text-[9px]">stack</div>
          <div>Circom + Groth16 · snarkjs · Soroban BN254 pairing_check</div>
          <div className="text-dim/70">Stellar Hacks: Real-World ZK</div>
        </div>
      </div>
    </footer>
  );
}
