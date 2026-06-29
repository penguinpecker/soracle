import { useCallback, useEffect, useState } from "react";
import { getAddress, isConnected, requestAccess, signMessage } from "@stellar/freighter-api";

/** Freighter connect + message-sign. The user "initiates from their wallet";
 *  all chain calls remain keyless read-only simulates, so this is the gesture
 *  of authorship, not a fund-moving signature. Degrades gracefully without the
 *  extension (proving + verify still run). */
export function useWallet() {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    getAddress().then((r) => r.address && setAddress(r.address)).catch(() => {});
  }, []);

  // Returns the address if connected, else "" (silently — Freighter is optional;
  // the demo continues in guest mode and all chain calls stay keyless).
  const connect = useCallback(async (): Promise<string> => {
    setConnecting(true);
    try {
      const c = await isConnected();
      if (!c.isConnected) {
        setUnavailable(true);
        return "";
      }
      const r = await requestAccess();
      if (r.error) return "";
      setAddress(r.address);
      return r.address;
    } catch {
      setUnavailable(true);
      return "";
    } finally {
      setConnecting(false);
    }
  }, []);

  const authorize = useCallback(
    async (message: string): Promise<boolean> => {
      if (!address) return false;
      try {
        const r = await signMessage(message, { address });
        return !r.error;
      } catch {
        return false;
      }
    },
    [address],
  );

  return { address, connecting, unavailable, connect, authorize };
}
