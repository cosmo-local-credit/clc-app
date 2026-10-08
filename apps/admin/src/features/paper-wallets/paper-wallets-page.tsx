import {
  EMPTY_PAPER_WALLET_RECIPIENT,
  formatCsv,
  MAX_PAPER_WALLET_BATCH,
  type PaperWalletCsvRow,
} from "@clc/core/features/paper-wallet-batch/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { PageHeader } from "#/components/admin/page-header";
import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { isModifiedClick } from "#/lib/tab-navigation";
import { downloadBlob } from "./download";
import { NfcWriterPanel } from "./nfc/nfc-writer-panel";
import { useNfcWriter } from "./nfc/use-nfc-writer";
import {
  type PaperWalletCarrier,
  PAPER_WALLET_SOURCES,
  type PaperWalletSource,
  type PaperWalletsSearch,
} from "./paper-wallets-search";
import { renderPaperWalletSheet } from "./render-sheet";
import { BatchResults, type IssuanceByRow } from "./ui/batch-results";
import { CardDesignFields } from "./ui/card-design-fields";
import { CardPreview } from "./ui/card-preview";
import { CsvSource } from "./ui/csv-source";
import type { PaperWalletCardDesign } from "./ui/paper-wallet-card";
import { type ProtectionDraft, ProtectionFields, protectionError } from "./ui/protection-fields";
import { type BatchEntry, usePaperWalletBatch } from "./use-paper-wallet-batch";

const SOURCE_LABELS: Record<PaperWalletSource, string> = {
  blank: "Blank wallets",
  csv: "From CSV",
};

/**
 * Encryption workers while preparing NFC cards on a phone. Each scrypt job
 * holds 32 MiB; start conservative and measure memory and heat on the pilot
 * phones before raising it.
 */
const NFC_ENCRYPT_WORKERS = 2;

/** Give React's new progress state a browser paint before export work begins. */
function afterProgressPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallback = window.setTimeout(finish, 1000);
      requestAnimationFrame(() => {
        window.clearTimeout(fallback);
        window.setTimeout(finish, 0);
      });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

/**
 * Bulk paper wallet issuance.
 *
 * The console generates each key, registers the holder's account with it (the
 * backend approves on signup), and either prints the cards ten to an A4 sheet
 * or, on an NFC-capable Android phone, writes each to a blank NFC card. Nothing
 * secret leaves the tab: the PDF is built here and downloaded, a card is written
 * from here, and the manifest CSV carries addresses only.
 */
export function PaperWalletsPage({ search }: { search: PaperWalletsSearch }) {
  const navigate = useNavigate();
  const batch = usePaperWalletBatch();
  const nfcSupported = useWebNfcSupported();
  // A shared link to the NFC writer opened on a desktop falls back to print.
  const carrier: PaperWalletCarrier = nfcSupported ? search.carrier : "print";
  const writer = useNfcWriter({
    wallets: batch.wallets,
    preparing: batch.phase === "preparing",
    urlFor: batch.qrUrlFor,
    rowForUrl: batch.rowForUrl,
  });
  const unissuedCards = writer.counts.remaining + writer.counts.skipped;
  const [count, setCount] = useState("10");
  const [printedName, setPrintedName] = useState("");
  const [csvRows, setCsvRows] = useState<PaperWalletCsvRow[] | null>(null);
  const [design, setDesign] = useState<PaperWalletCardDesign>({
    website: "cosmolocal.credit",
    description: "",
    logoDataUrl: null,
  });
  const [protection, setProtection] = useState<ProtectionDraft>({
    kind: "password",
    passphrase: "",
    confirmation: "",
  });
  const [hairlines, setHairlines] = useState(true);
  const [renderStage, setRenderStage] = useState<"preparing" | "cards" | "assembling" | null>(null);
  const [rendered, setRendered] = useState(0);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  const unprinted = batch.wallets.some((wallet) => wallet.status === "ready") && !pdfDownloaded;
  // The keys exist only in this tab from the moment they are generated, so
  // leaving mid-batch is as costly as leaving unprinted or unwritten:
  // registration can still land on the backend for accounts whose keys nobody
  // holds, and there is no recovering a key from the public row afterwards.
  const keysAtRisk =
    batch.phase === "preparing" || (carrier === "nfc" ? unissuedCards > 0 : unprinted);
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
  const batchPassphrase = protection.kind === "password" ? protection.passphrase : null;
  const entries: BatchEntry[] =
    search.source === "blank"
      ? countError
        ? []
        : Array.from({ length: countValue }, () => ({
            recipient: { ...EMPTY_PAPER_WALLET_RECIPIENT, name: printedName.trim() },
            passphrase: batchPassphrase,
          }))
      : (csvRows ?? [])
          .filter((row) => row.errors.length === 0)
          .map((row) => ({ recipient: row.recipient, passphrase: row.password || null }));
  const passwordError = search.source === "blank" ? protectionError(protection) : null;
  const canStart = entries.length > 0 && !passwordError;

  function start() {
    if (!canStart) return;
    setPdfDownloaded(false);
    writer.reset();
    void batch.start(
      entries,
      carrier === "nfc" ? { encryptWorkers: NFC_ENCRYPT_WORKERS } : undefined,
    );
  }

  const issuance = useMemo<IssuanceByRow | null>(() => {
    if (carrier !== "nfc") return null;
    return Object.fromEntries(
      Object.entries(writer.model.issuance).map(([id, entry]) => [id, entry.status]),
    );
  }, [carrier, writer.model.issuance]);

  async function downloadPdf() {
    const ready = batch.wallets.filter((wallet) => wallet.status === "ready");
    flushSync(() => {
      setRenderStage("preparing");
      setRendered(0);
    });
    try {
      await afterProgressPaint();
      const blob = await renderPaperWalletSheet(
        ready.map((wallet) => ({
          address: wallet.address,
          name: wallet.recipient.name,
          qrUrl: batch.qrUrlFor(wallet.id) ?? "",
        })),
        design,
        {
          hairlines,
          onProgress: (done) => {
            setRenderStage("cards");
            setRendered(done);
          },
          onAssembling: () => setRenderStage("assembling"),
        },
      );
      downloadBlob(blob, `clc-paper-wallets-${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfDownloaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally {
      setRenderStage(null);
    }
  }

  function downloadManifest() {
    const issued = (wallet: (typeof batch.wallets)[number]) => {
      if (wallet.status !== "ready") return "";
      if (carrier === "print") return pdfDownloaded ? "pdf" : "none";
      const status = issuance?.[wallet.id] ?? "pending";
      return status === "pending" ? "none" : `nfc-${status}`;
    };
    const rows = batch.wallets.map((wallet) => [
      wallet.address,
      wallet.recipient.name,
      wallet.recipient.email,
      wallet.recipient.phone,
      wallet.recipient.country,
      wallet.recipient.currency,
      wallet.status === "ready" ? "registered" : wallet.status,
      issued(wallet),
      wallet.error ?? wallet.profileWarning ?? "",
    ]);
    downloadBlob(
      new Blob(
        [
          formatCsv([
            [
              "address",
              "name",
              "email",
              "phone",
              "country",
              "currency",
              "status",
              "issuance",
              "note",
            ],
            ...rows,
          ]),
        ],
        { type: "text/csv" },
      ),
      `clc-paper-wallets-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  function reset() {
    const warning =
      carrier === "nfc"
        ? unissuedCards > 0
          ? `${unissuedCards} registered wallet${unissuedCards === 1 ? " has" : "s have"} no card yet. Discard these wallets?`
          : null
        : unprinted
          ? "The PDF has not been downloaded. Discard these wallets?"
          : null;
    if (warning && !window.confirm(warning)) return;
    batch.reset();
    writer.reset();
    setPdfDownloaded(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Paper wallets" />

      {batch.phase !== "idle" ? (
        <div className="flex flex-col gap-4">
          {carrier === "nfc" ? (
            <NfcWriterPanel writer={writer} wallets={batch.wallets} urlFor={batch.qrUrlFor} />
          ) : null}
          <BatchResults
            carrier={carrier}
            issuance={issuance}
            wallets={batch.wallets}
            phase={batch.phase}
            encrypted={batch.encrypted}
            toEncrypt={batch.toEncrypt}
            renderStage={renderStage}
            rendered={rendered}
            pdfDownloaded={pdfDownloaded}
            onDownloadPdf={() => void downloadPdf()}
            onDownloadManifest={downloadManifest}
            onRetryFailed={batch.retryFailed}
            onReset={reset}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="xl:col-span-2">
            <Tabs
              value={search.source}
              onValueChange={(next) => {
                if (next === search.source) return;
                void navigate({
                  to: "/paper-wallets",
                  search: { source: next as PaperWalletSource, carrier: search.carrier },
                });
              }}
            >
              <TabsList>
                {PAPER_WALLET_SOURCES.map((source) => (
                  <TabsTab
                    key={source}
                    value={source}
                    nativeButton={false}
                    render={
                      <Link
                        to="/paper-wallets"
                        search={{ source, carrier: search.carrier }}
                        aria-current={source === search.source ? "page" : undefined}
                        onClick={(event) => {
                          if (event.button === 0 && !isModifiedClick(event)) event.preventDefault();
                        }}
                      />
                    }
                  >
                    {SOURCE_LABELS[source]}
                  </TabsTab>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {nfcSupported ? (
              <section className="space-y-4 border border-border bg-card p-4">
                <SectionLabel>Issue as</SectionLabel>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[carrier]}
                  onValueChange={(values) => {
                    const next = values[0] as PaperWalletCarrier | undefined;
                    if (!next || next === carrier) return;
                    void navigate({
                      to: "/paper-wallets",
                      search: { source: search.source, carrier: next },
                    });
                  }}
                >
                  <ToggleGroupItem value="print">Print A4 sheets</ToggleGroupItem>
                  <ToggleGroupItem value="nfc">Write NFC cards</ToggleGroupItem>
                </ToggleGroup>
                {carrier === "nfc" ? (
                  <p className="text-muted-foreground text-sm">
                    Each wallet is written to a blank NFC card on this phone, one card at a time.
                    Writing starts once the first few wallets are registered and the rest keep
                    preparing behind it. Keep the page open until every card is written.
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="space-y-4 border border-border bg-card p-4">
              {search.source === "blank" ? (
                <>
                  <SectionLabel>Wallets</SectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="paper-wallet-count">Number of wallets</Label>
                      <Input
                        id="paper-wallet-count"
                        type="number"
                        min={1}
                        max={MAX_PAPER_WALLET_BATCH}
                        value={count}
                        aria-invalid={countError ? true : undefined}
                        onChange={(event) => setCount(event.target.value)}
                        className="font-data"
                      />
                      {countError ? (
                        <p className="text-destructive text-xs">{countError}</p>
                      ) : (
                        <p className="text-muted-foreground font-data text-xs">
                          {Math.ceil(countValue / 10)} A4 sheet{countValue > 10 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paper-wallet-printed-name">Printed name</Label>
                      <Input
                        id="paper-wallet-printed-name"
                        value={printedName}
                        maxLength={32}
                        placeholder="Empty prints a line to write on"
                        onChange={(event) => setPrintedName(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <CsvSource rows={csvRows} onRowsChange={setCsvRows} />
              )}
            </section>

            <section className="border border-border bg-card p-4">
              <CardDesignFields value={design} onChange={setDesign} />
            </section>

            {search.source === "blank" ? (
              <section className="border border-border bg-card p-4">
                <ProtectionFields value={protection} onChange={setProtection} />
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label
                htmlFor="paper-wallet-hairlines"
                className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="paper-wallet-hairlines"
                  checked={hairlines}
                  onCheckedChange={(checked) => setHairlines(checked === true)}
                />
                Print cut lines between cards
              </label>
              <div className="flex items-center gap-3">
                {passwordError && protection.passphrase ? (
                  <p className="text-destructive text-xs">{passwordError}</p>
                ) : null}
                <Button type="button" disabled={!canStart} onClick={start}>
                  {carrier === "nfc" ? "Prepare" : "Generate"} {entries.length || ""} wallet
                  {entries.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <CardPreview
              name={
                search.source === "blank"
                  ? printedName.trim()
                  : (entries[0]?.recipient.name ?? "Jane Doe")
              }
              design={design}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
