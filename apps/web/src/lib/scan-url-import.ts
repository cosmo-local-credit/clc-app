import { useCallback, useEffect, useState } from "react";
import { connect, getAccount } from "wagmi/actions";
import { clearPrivateKey, storePrivateKey } from "#/connectors/privateKey";
import { parsePaperWalletImportPayload } from "#/lib/paper-wallet-import";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";

export type PendingScanUrlImport =
  | { type: "raw"; key: `0x${string}` }
  | { type: "encrypted"; encryptedKey: string };

/**
 * Detects a `?w=<key>` param on the current URL and handles it:
 * - If no wallet is currently connected: auto-imports and connects silently.
 * - If a wallet is already connected: returns the pending key so the caller
 *   can show a confirmation dialog before switching.
 *
 * Always strips the `?w=` param from the URL bar.
 */
export function useScanUrlImport(): {
  pendingImport: PendingScanUrlImport | null;
  pendingKey: `0x${string}` | null;
  pendingEncryptedKey: string | null;
  queuePendingKey: (key: `0x${string}`) => void;
  clearPendingImport: () => void;
  clearPendingKey: () => void;
} {
  const [pendingImport, setPendingImport] = useState<PendingScanUrlImport | null>(null);
  const pendingKey = pendingImport?.type === "raw" ? pendingImport.key : null;
  const pendingEncryptedKey =
    pendingImport?.type === "encrypted" ? pendingImport.encryptedKey : null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const raw = search.get("w");
    if (!raw) return;

    history.replaceState(null, "", window.location.pathname);

    const result = parsePaperWalletImportPayload(raw);
    if (result.type === "invalid") return;

    if (result.type === "encrypted") {
      setPendingImport({ type: "encrypted", encryptedKey: result.encryptedKey });
      return;
    }

    const { isConnected } = getAccount(wagmiConfig);

    if (isConnected) {
      setPendingImport({ type: "raw", key: result.key });
    } else {
      storePrivateKey(result.key);
      void connect(wagmiConfig, { connector: pkConnector }).catch(() => {
        clearPrivateKey();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount

  const clearPendingImport = useCallback(() => setPendingImport(null), []);
  const queuePendingKey = useCallback(
    (key: `0x${string}`) => setPendingImport({ type: "raw", key }),
    [],
  );

  return {
    pendingImport,
    pendingKey,
    pendingEncryptedKey,
    queuePendingKey,
    clearPendingImport,
    clearPendingKey: clearPendingImport,
  };
}
