import { useCallback, useEffect, useState } from "react";
import { parsePaperWalletImportPayload } from "#/lib/paper-wallet-import";

export type PendingScanUrlImport =
  | { type: "raw"; key: `0x${string}` }
  | { type: "encrypted"; encryptedKey: string };

/**
 * Detects a `?w=<key>` param on the current URL and returns an explicit
 * pending import. The caller must show a confirmation/unlock UI before
 * connecting, even for guests.
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

    const url = new URL(window.location.href);
    const raw = url.searchParams.get("w");
    if (!raw) return;

    url.searchParams.delete("w");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    const result = parsePaperWalletImportPayload(raw);
    if (result.type === "invalid") return;

    if (result.type === "encrypted") {
      setPendingImport({ type: "encrypted", encryptedKey: result.encryptedKey });
      return;
    }

    setPendingImport({ type: "raw", key: result.key });
  }, []);

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
