import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { ColumnDef } from "@tanstack/react-table";
import { memo } from "react";
import { FiLoader } from "react-icons/fi";
import { HiOutlineDocumentDownload, HiOutlinePrinter, HiOutlineRefresh } from "react-icons/hi";

import { CopyButton } from "#/components/admin/copy-button";
import { DataTable } from "#/components/admin/data-table";
import { SectionLabel } from "#/components/admin/section-heading";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import type { BatchPhase, BatchWallet } from "../use-paper-wallet-batch";

const STATE: Record<BatchWallet["status"], string> = {
  queued: "queued",
  registering: "registering",
  ready: "registered",
  failed: "failed",
};

const columns: Array<ColumnDef<BatchWallet>> = [
  {
    id: "index",
    header: "#",
    accessorFn: (wallet) => wallet.id + 1,
    cell: ({ getValue }) => <span className="font-data text-xs">{String(getValue())}</span>,
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1 font-mono text-xs">
        {formatVoucherAddress(row.original.address)}
        <CopyButton value={row.original.address} label="Copy address" />
      </span>
    ),
  },
  {
    id: "name",
    header: "Name",
    accessorFn: (wallet) => wallet.recipient.name || "—",
  },
  {
    id: "contact",
    header: "Contact",
    accessorFn: (wallet) => wallet.recipient.email || wallet.recipient.phone || "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StateBadge state={STATE[row.original.status]} kind="wallet" />,
  },
  {
    id: "note",
    header: "Note",
    accessorFn: (wallet) => wallet.error ?? wallet.profileWarning ?? "",
    cell: ({ row }) =>
      row.original.error ? (
        <span className="text-destructive text-xs">{row.original.error}</span>
      ) : row.original.profileWarning ? (
        <span className="text-xs text-amber-700 dark:text-amber-400">
          Profile details not saved: {row.original.profileWarning}
        </span>
      ) : null,
  },
];

/** PDF progress changes often; the wallet rows do not change during export. */
const WalletTable = memo(function WalletTable({ wallets }: { wallets: BatchWallet[] }) {
  return <DataTable columns={columns} data={wallets} />;
});

export function BatchResults({
  wallets,
  phase,
  encrypted,
  renderStage,
  rendered,
  pdfDownloaded,
  onDownloadPdf,
  onDownloadManifest,
  onRetryFailed,
  onReset,
}: {
  wallets: BatchWallet[];
  phase: BatchPhase;
  encrypted: number;
  renderStage: "preparing" | "cards" | "assembling" | null;
  rendered: number;
  pdfDownloaded: boolean;
  onDownloadPdf: () => void;
  onDownloadManifest: () => void;
  onRetryFailed: () => void;
  onReset: () => void;
}) {
  const ready = wallets.filter((wallet) => wallet.status === "ready").length;
  const failed = wallets.filter((wallet) => wallet.status === "failed").length;
  const busy = phase === "encrypting" || phase === "registering";
  const rendering = renderStage !== null;

  const progress =
    phase === "encrypting"
      ? `Encrypting keys… ${encrypted} / ${wallets.length}`
      : phase === "registering"
        ? `Registering accounts… ${ready + failed} / ${wallets.length}`
        : renderStage === "preparing"
          ? "Preparing card design…"
          : renderStage === "cards"
            ? `Drawing cards… ${rendered} / ${ready}`
            : renderStage === "assembling"
              ? "Assembling PDF…"
              : `${ready} of ${wallets.length} wallets registered and approved${failed ? `, ${failed} failed` : ""}.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <SectionLabel>Batch</SectionLabel>
          <p className="font-data text-sm" aria-live="polite">
            {progress}
          </p>
          {rendering ? (
            <div
              className="flex min-w-64 items-center gap-3 pt-2"
              aria-label="PDF generation in progress"
            >
              <FiLoader className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <div
                role="progressbar"
                aria-label="PDF generation"
                aria-valuemin={0}
                aria-valuemax={ready}
                aria-valuenow={renderStage === "cards" ? rendered : undefined}
                aria-valuetext={progress}
                className="h-2 w-full overflow-hidden bg-muted"
              >
                <div
                  className={`h-full bg-primary ${renderStage === "cards" ? "" : "w-1/3 animate-pulse"}`}
                  style={
                    renderStage === "cards"
                      ? { width: `${ready ? (rendered / ready) * 100 : 0}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          ) : null}
          {phase === "done" && !pdfDownloaded ? (
            <p className="text-muted-foreground text-xs">
              Download the PDF before leaving. Keys cannot be recovered.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {failed > 0 && phase === "done" ? (
            <Button type="button" variant="outline" onClick={onRetryFailed}>
              <HiOutlineRefresh />
              Retry {failed} failed
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy || ready === 0}
            onClick={onDownloadManifest}
          >
            <HiOutlineDocumentDownload />
            Manifest CSV
          </Button>
          <Button type="button" disabled={busy || rendering || ready === 0} onClick={onDownloadPdf}>
            {rendering ? <FiLoader className="animate-spin" /> : <HiOutlinePrinter />}
            {rendering ? "Creating PDF…" : `Download A4 PDF (${ready})`}
          </Button>
          <Button type="button" variant="ghost" disabled={busy || rendering} onClick={onReset}>
            New batch
          </Button>
        </div>
      </div>
      <WalletTable wallets={wallets} />
    </div>
  );
}
