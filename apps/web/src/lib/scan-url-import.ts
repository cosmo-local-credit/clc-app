import { useCallback, useEffect, useState } from "react";
import { connect, getAccount } from "wagmi/actions";
import { normalizePrivateKey } from "#/connectors/normalize-private-key";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";

/**
 * Detects a `?w=<key>` param on the current URL and handles it:
 * - If no wallet is currently connected: auto-imports and connects silently.
 * - If a wallet is already connected: returns the pending key so the caller
 *   can show a confirmation dialog before switching.
 *
 * Always strips the `?w=` param from the URL bar.
 */
export function useScanUrlImport(): {
  pendingKey: `0x${string}` | null;
  clearPendingKey: () => void;
} {
  const [pendingKey, setPendingKey] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const raw = search.get("w");
    if (!raw) return;

    history.replaceState(null, "", window.location.pathname);

    const result = normalizePrivateKey(raw);
    if (!result.ok) return;

    const { isConnected } = getAccount(wagmiConfig);

    if (isConnected) {
      setPendingKey(result.key);
    } else {
      storePrivateKey(result.key);
      void connect(wagmiConfig, { connector: pkConnector }).catch(() => {
        clearPrivateKey();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount

  return { pendingKey, clearPendingKey: useCallback(() => setPendingKey(null), []) };
}
