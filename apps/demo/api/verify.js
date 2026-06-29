// Vercel serverless function: submit a REAL on-chain `verify` transaction.
// The browser generates the Groth16 proof; this relays it to the verifier
// contract as a recorded Soroban transaction (signed by a funded testnet relayer
// key — verify is permissionless, no funds move), then returns the tx hash so
// the result is independently checkable on Stellar Expert.
import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = "Test SDF Network ; September 2015";
const VERIFIER = "CDBACVTNIBBEP5AOMIR22PAFJMWVLV75UYXRM4BPCSHG6EHHMGWIRDQC";

const fe = (d) => {
  let h = BigInt(d).toString(16);
  if (h.length > 64) throw new Error("field element overflows 32 bytes");
  h = h.padStart(64, "0");
  const o = new Uint8Array(32);
  for (let i = 0; i < 32; i++) o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return o;
};
const cat = (...a) => {
  const n = a.reduce((s, x) => s + x.length, 0);
  const o = new Uint8Array(n);
  let k = 0;
  for (const x of a) { o.set(x, k); k += x.length; }
  return o;
};
const g1 = (p) => cat(fe(p[0]), fe(p[1]));               // X || Y
const g2 = (p) => cat(fe(p[0][1]), fe(p[0][0]), fe(p[1][1]), fe(p[1][0])); // c1 first (CAP-0074)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const secret = process.env.RELAYER_SECRET;
    if (!secret) return res.status(500).json({ error: "relayer not configured" });

    const { vkId, proof, publicSignals } = req.body ?? {};
    if (!proof || !Array.isArray(publicSignals)) return res.status(400).json({ error: "bad request" });

    const proofScVal = nativeToScVal(
      { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) },
      { type: { a: ["symbol", "bytes"], b: ["symbol", "bytes"], c: ["symbol", "bytes"] } },
    );
    const pubScVal = nativeToScVal(publicSignals.map(fe));

    const server = new Server(RPC);
    const kp = Keypair.fromSecret(secret);
    const account = await server.getAccount(kp.publicKey());

    let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASS })
      .addOperation(new Contract(VERIFIER).call("verify", nativeToScVal(Number(vkId), { type: "u32" }), proofScVal, pubScVal))
      .setTimeout(60)
      .build();

    tx = await server.prepareTransaction(tx);
    tx.sign(kp);

    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      return res.status(200).json({ ok: false, hash: sent.hash, error: "send failed" });
    }
    const result = await server.pollTransaction(sent.hash, { attempts: 25, sleepStrategy: () => 1200 });
    const ok = result.status === Api.GetTransactionStatus.SUCCESS && scValToNative(result.returnValue) === true;
    return res.status(200).json({ ok, hash: sent.hash, status: result.status });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
}
