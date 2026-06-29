import { useCallback, useEffect, useState } from "react";
import { getAddress, isConnected, requestAccess, signMessage } from "@stellar/freighter-api";
import { StrKey } from "@stellar/stellar-sdk";

export interface ConnectResult {
  ok: boolean;
  error?: string;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);

/** Wallet identity for the demo. Freighter when present (real popup + sign), or
 *  any Stellar address entered by the user. Reads + on-chain verification are
 *  keyless, so the address is the initiator identity, not a fund-moving key. */
export function useWallet() {
  const [address, setAddress] = useState("");
  const [via, setVia] = useState<"freighter" | "manual" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAddress().then((r) => { if (r.address) { setAddress(r.address); setVia("freighter"); } }).catch(() => {});
  }, []);

  const connectFreighter = useCallback(async (): Promise<ConnectResult> => {
    setBusy(true);
    try {
      const c = await withTimeout(isConnected(), 2500, { isConnected: false } as any);
      if (!c?.isConnected) return { ok: false, error: "Freighter not detected in this browser." };
      const r = await requestAccess();
      if (r.error || !r.address) return { ok: false, error: "Connection declined." };
      setAddress(r.address);
      setVia("freighter");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    } finally {
      setBusy(false);
    }
  }, []);

  const connectManual = useCallback((addr: string): ConnectResult => {
    const a = addr.trim();
    if (!StrKey.isValidEd25519PublicKey(a)) {
      return { ok: false, error: "Not a valid Stellar address (must start with G, 56 chars)." };
    }
    setAddress(a);
    setVia("manual");
    return { ok: true };
  }, []);

  // Only Freighter can sign; a manually-entered address has no key here, so we
  // skip signing (the on-chain verify is keyless regardless).
  const authorize = useCallback(
    async (message: string): Promise<boolean> => {
      if (!address || via !== "freighter") return true;
      try {
        const r = await withTimeout(signMessage(message, { address }), 60000, { error: "timeout" } as any);
        return !r.error;
      } catch {
        return false;
      }
    },
    [address, via],
  );

  const disconnect = useCallback(() => { setAddress(""); setVia(null); }, []);

  return { address, via, busy, connectFreighter, connectManual, authorize, disconnect };
}
