import { parsePaperWalletImportPayload } from "@clc/core/features/wallet/paper-wallet";
import { useLingui } from "@lingui/react/macro";
import { lazy, Suspense, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

/**
 * Reads a sign-in card — camera or saved image, and its password when it has
 * one — and hands back the key only if it belongs to `expected`.
 */
export function CardReader({
  expected,
  title,
  onKey,
  onCancel,
}: {
  expected: `0x${string}`;
  title: string;
  onKey: (key: `0x${string}`) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = (key: `0x${string}`) => {
    if (privateKeyToAccount(key).address.toLowerCase() !== expected.toLowerCase()) {
      setError(t`This is a different sign-in card.`);
      return;
    }
    setError(null);
    onKey(key);
  };

  if (encrypted) {
    return (
      <Suspense fallback={null}>
        <EncryptedPaperWalletImportForm
          encryptedKey={encrypted}
          onDecrypted={(key) => {
            setEncrypted(null);
            accept(key);
          }}
          onCancel={() => setEncrypted(null)}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      <PaperWalletScanner
        title={title}
        onCancel={onCancel}
        onKeyDecoded={(raw) => {
          const result = parsePaperWalletImportPayload(raw);
          if (result.type === "raw") accept(result.key);
          else if (result.type === "encrypted") setEncrypted(result.encryptedKey);
          else setError(t`This QR code does not contain a valid sign-in card.`);
        }}
      />
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
