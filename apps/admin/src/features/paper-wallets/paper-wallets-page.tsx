import {
  EMPTY_PAPER_WALLET_RECIPIENT,
  formatCsv,
  MAX_PAPER_WALLET_BATCH,
  type PaperWalletCsvRow,
} from "@clc/core/features/paper-wallet-batch/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { PageHeader } from "#/components/admin/page-header";
import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs";
import { isModifiedClick } from "#/lib/tab-navigation";
import { downloadBlob } from "./download";
import {
  PAPER_WALLET_SOURCES,
  type PaperWalletSource,
  type PaperWalletsSearch,
} from "./paper-wallets-search";
import { renderPaperWalletSheet } from "./render-sheet";
import { BatchResults } from "#/components/wallet-batch/batch-results";
import { CardDesignFields } from "./ui/card-design-fields";
import { CardPreview } from "./ui/card-preview";
import { CsvSource } from "./ui/csv-source";
import type { PaperWalletCardDesign } from "./ui/paper-wallet-card";
import {
  type ProtectionDraft,
  ProtectionFields,
  protectionError,
} from "#/components/wallet-batch/protection-fields";
import { type BatchEntry, usePaperWalletBatch } from "./use-paper-wallet-batch";

const SOURCE_LABELS: Record<PaperWalletSource, string> = {
  blank: "Blank sign-in cards",
  csv: "From CSV",
};

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

export function PaperWalletsPage({ search }: { search: PaperWalletsSearch }) {
  const navigate = useNavigate();
  const batch = usePaperWalletBatch();
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
  const keysAtRisk = batch.phase === "preparing" || unprinted;
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
    void batch.start(entries);
  }

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
      downloadBlob(blob, `clc-sign-in-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfDownloaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally {
      setRenderStage(null);
    }
  }

  function downloadManifest() {
    const rows = batch.wallets.map((wallet) => [
      wallet.address,
      wallet.recipient.name,
      wallet.recipient.email,
      wallet.recipient.phone,
      wallet.recipient.country,
      wallet.recipient.currency,
      wallet.status === "ready" ? "registered" : wallet.status,
      wallet.status === "ready" ? (pdfDownloaded ? "pdf" : "none") : "",
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
      `clc-sign-in-cards-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  function reset() {
    if (unprinted && !window.confirm("The PDF has not been downloaded. Discard these cards?"))
      return;
    batch.reset();
    setPdfDownloaded(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sign-in cards" />

      {batch.phase !== "idle" ? (
        <div className="flex flex-col gap-4">
          <BatchResults
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
                  search: { source: next as PaperWalletSource },
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
                        search={{ source }}
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
            <section className="space-y-4 border border-border bg-card p-4">
              {search.source === "blank" ? (
                <>
                  <SectionLabel>Sign-in cards</SectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="paper-wallet-count">Number of cards</Label>
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
                  Generate {entries.length || ""} sign-in card
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
