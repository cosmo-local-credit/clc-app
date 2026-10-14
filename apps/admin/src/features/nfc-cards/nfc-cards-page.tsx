import {
  EMPTY_PAPER_WALLET_RECIPIENT,
  formatCsv,
  MAX_PAPER_WALLET_BATCH,
} from "@clc/core/features/paper-wallet-batch/logic";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { BatchResults, type IssuanceByRow } from "#/components/wallet-batch/batch-results";
import {
  type ProtectionDraft,
  ProtectionFields,
  protectionError,
} from "#/components/wallet-batch/protection-fields";
import { downloadBlob } from "#/features/paper-wallets/download";
import { usePaperWalletBatch } from "#/features/paper-wallets/use-paper-wallet-batch";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { NfcWriterPanel } from "./nfc-writer-panel";
import { useNfcWriter } from "./use-nfc-writer";

export function NfcCardsPage() {
  const supported = useWebNfcSupported();
  const batch = usePaperWalletBatch();
  const writer = useNfcWriter({
    wallets: batch.wallets,
    preparing: batch.phase === "preparing",
    urlFor: batch.qrUrlFor,
    rowForUrl: batch.rowForUrl,
  });
  const [count, setCount] = useState("10");
  const [protection, setProtection] = useState<ProtectionDraft>({
    kind: "password",
    passphrase: "",
    confirmation: "",
  });

  const unissued = writer.counts.remaining + writer.counts.skipped;
  const keysAtRisk = batch.phase === "preparing" || unissued > 0;
  useEffect(() => {
    if (!keysAtRisk) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [keysAtRisk]);

  const countValue = Number(count);
  const countError =
    Number.isInteger(countValue) && countValue >= 1 && countValue <= MAX_PAPER_WALLET_BATCH
      ? null
      : `Enter a whole number from 1 to ${MAX_PAPER_WALLET_BATCH}.`;
  const passwordError = protectionError(protection);
  const issuance = useMemo<IssuanceByRow>(
    () =>
      Object.fromEntries(
        Object.entries(writer.model.issuance).map(([id, entry]) => [id, entry.status]),
      ),
    [writer.model.issuance],
  );

  function start() {
    if (!supported || countError || passwordError) return;
    writer.reset();
    void batch.start(
      Array.from({ length: countValue }, () => ({
        recipient: { ...EMPTY_PAPER_WALLET_RECIPIENT },
        passphrase: protection.kind === "password" ? protection.passphrase : null,
      })),
      // Each scrypt worker holds 32 MiB; keep phone preparation to two workers.
      { encryptWorkers: 2, useAddressAsName: true },
    );
  }

  function reset() {
    if (unissued > 0 && !window.confirm(`Discard ${unissued} wallets without cards?`)) return;
    writer.reset();
    batch.reset();
  }

  function downloadManifest() {
    const rows = batch.wallets.map((wallet) => [
      wallet.address,
      wallet.status === "ready" ? "registered" : wallet.status,
      wallet.status === "ready" ? (issuance[wallet.id] ?? "pending") : "",
      wallet.error ?? wallet.profileWarning ?? "",
    ]);
    downloadBlob(
      new Blob([formatCsv([["address", "status", "card", "note"], ...rows])], { type: "text/csv" }),
      `clc-nfc-cards-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="NFC cards" />
      {!supported ? (
        <p className="border border-border bg-card p-4 text-sm">
          Use Chrome on an Android phone with NFC.
        </p>
      ) : null}
      {batch.phase === "idle" ? (
        <div className="flex flex-col gap-4">
          <section className="space-y-2 border border-border bg-card p-4">
            <Label htmlFor="nfc-card-count">Number of cards</Label>
            <Input
              id="nfc-card-count"
              className="font-data"
              type="number"
              min={1}
              max={MAX_PAPER_WALLET_BATCH}
              value={count}
              aria-invalid={countError ? true : undefined}
              onChange={(event) => setCount(event.target.value)}
            />
            {countError ? <p className="text-destructive text-xs">{countError}</p> : null}
          </section>
          <section className="border border-border bg-card p-4">
            <ProtectionFields carrier="NFC card" value={protection} onChange={setProtection} />
          </section>
          {passwordError && protection.passphrase ? (
            <p className="text-destructive text-xs">{passwordError}</p>
          ) : null}
          <Button
            className="h-12"
            disabled={!supported || !!countError || !!passwordError}
            onClick={start}
          >
            Prepare {countError ? "" : countValue} card{countValue === 1 ? "" : "s"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {supported ? (
            <NfcWriterPanel writer={writer} wallets={batch.wallets} urlFor={batch.qrUrlFor} />
          ) : null}
          <BatchResults
            carrier="nfc"
            issuance={issuance}
            wallets={batch.wallets}
            phase={batch.phase}
            encrypted={batch.encrypted}
            toEncrypt={batch.toEncrypt}
            onDownloadManifest={downloadManifest}
            onRetryFailed={batch.retryFailed}
            onReset={reset}
          />
        </div>
      )}
    </div>
  );
}
