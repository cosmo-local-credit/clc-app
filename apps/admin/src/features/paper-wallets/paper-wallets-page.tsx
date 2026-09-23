import {
  EMPTY_PAPER_WALLET_RECIPIENT,
  formatCsv,
  MAX_PAPER_WALLET_BATCH,
  type PaperWalletCsvRow,
  type PaperWalletRecipient,
} from "@clc/core/features/paper-wallet-batch/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "#/components/admin/page-header";
import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs";
import { isModifiedClick } from "#/lib/tab-navigation";
import { downloadBlob } from "./download";
import {
  PAPER_WALLET_SOURCES,
  type PaperWalletSource,
  type PaperWalletsSearch,
} from "./paper-wallets-search";
import { renderPaperWalletSheet } from "./render-sheet";
import { BatchResults } from "./ui/batch-results";
import { CardDesignFields } from "./ui/card-design-fields";
import { CardPreview } from "./ui/card-preview";
import { CsvSource } from "./ui/csv-source";
import type { PaperWalletCardDesign } from "./ui/paper-wallet-card";
import { type ProtectionDraft, ProtectionFields, protectionError } from "./ui/protection-fields";
import { usePaperWalletBatch } from "./use-paper-wallet-batch";

const SOURCE_LABELS: Record<PaperWalletSource, string> = {
  blank: "Blank wallets",
  csv: "From CSV",
};

/**
 * Bulk paper wallet issuance.
 *
 * The console generates each key, registers the holder's account with it (the
 * backend approves on signup), and prints the cards ten to an A4 sheet. Nothing
 * secret leaves the tab: the PDF is built here and downloaded, and the manifest
 * CSV carries addresses only.
 */
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
  const [rendering, setRendering] = useState(false);
  const [rendered, setRendered] = useState(0);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  const unprinted = batch.wallets.some((wallet) => wallet.status === "ready") && !pdfDownloaded;
  useEffect(() => {
    if (!unprinted) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unprinted]);

  const countValue = Number(count);
  const countError =
    Number.isInteger(countValue) && countValue >= 1 && countValue <= MAX_PAPER_WALLET_BATCH
      ? null
      : `Enter a whole number from 1 to ${MAX_PAPER_WALLET_BATCH}.`;
  const recipients: PaperWalletRecipient[] =
    search.source === "blank"
      ? countError
        ? []
        : Array.from({ length: countValue }, () => ({
            ...EMPTY_PAPER_WALLET_RECIPIENT,
            name: printedName.trim(),
          }))
      : (csvRows ?? []).filter((row) => row.errors.length === 0).map((row) => row.recipient);
  const passwordError = protectionError(protection);
  const canStart = recipients.length > 0 && !passwordError;

  function start() {
    if (!canStart) return;
    setPdfDownloaded(false);
    void batch.start(
      recipients,
      protection.kind === "password"
        ? { kind: "password", passphrase: protection.passphrase }
        : { kind: "none" },
    );
  }

  async function downloadPdf() {
    const ready = batch.wallets.filter((wallet) => wallet.status === "ready");
    setRendering(true);
    setRendered(0);
    try {
      const blob = await renderPaperWalletSheet(
        ready.map((wallet) => ({
          address: wallet.address,
          name: wallet.recipient.name,
          qrUrl: batch.qrUrlFor(wallet.id) ?? "",
        })),
        design,
        { hairlines, onProgress: setRendered },
      );
      downloadBlob(blob, `clc-paper-wallets-${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfDownloaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally {
      setRendering(false);
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
      wallet.error ?? wallet.profileWarning ?? "",
    ]);
    downloadBlob(
      new Blob(
        [
          formatCsv([
            ["address", "name", "email", "phone", "country", "currency", "status", "note"],
            ...rows,
          ]),
        ],
        { type: "text/csv" },
      ),
      `clc-paper-wallets-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  function reset() {
    if (unprinted && !window.confirm("The PDF has not been downloaded. Discard these wallets?")) {
      return;
    }
    batch.reset();
    setPdfDownloaded(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paper wallets"
        description="Issue printable, pre-approved wallets in bulk. Each card is a bank-card sized QR that signs its holder in; they complete their profile, photo included, after the first scan."
      />

      {batch.phase !== "idle" ? (
        <BatchResults
          wallets={batch.wallets}
          phase={batch.phase}
          encrypted={batch.encrypted}
          rendering={rendering}
          rendered={rendered}
          pdfDownloaded={pdfDownloaded}
          onDownloadPdf={() => void downloadPdf()}
          onDownloadManifest={downloadManifest}
          onRetryFailed={batch.retryFailed}
          onReset={reset}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
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

            <section className="space-y-4 border border-border bg-card p-4">
              {search.source === "blank" ? (
                <>
                  <SectionLabel>Wallets</SectionLabel>
                  <p className="text-muted-foreground text-sm">
                    Blank cards carry no personal details. Holders fill in their name, contact and
                    photo after they sign in.
                  </p>
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

            <section className="border border-border bg-card p-4">
              <ProtectionFields value={protection} onChange={setProtection} />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="paper-wallet-hairlines"
                  checked={hairlines}
                  onCheckedChange={setHairlines}
                />
                <Label htmlFor="paper-wallet-hairlines">Print cut lines between cards</Label>
              </div>
              <div className="flex items-center gap-3">
                {passwordError && protection.passphrase ? (
                  <p className="text-destructive text-xs">{passwordError}</p>
                ) : null}
                <Button type="button" disabled={!canStart} onClick={start}>
                  Generate {recipients.length || ""} wallet{recipients.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
            {batch.fatalError ? (
              <p className="text-destructive text-sm">{batch.fatalError}</p>
            ) : null}
          </div>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <CardPreview
              name={
                search.source === "blank"
                  ? printedName.trim()
                  : (recipients[0]?.name ?? "Amina Njeri")
              }
              design={design}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
