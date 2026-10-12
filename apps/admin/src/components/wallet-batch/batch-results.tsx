import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { CardIssuanceStatus } from "@clc/core/features/nfc/issuance";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useMemo } from "react";
import { FiLoader } from "react-icons/fi";
import { HiOutlineDocumentDownload, HiOutlinePrinter, HiOutlineRefresh } from "react-icons/hi";

import { CopyButton } from "#/components/admin/copy-button";
import { DataTable } from "#/components/admin/data-table";
import { SectionLabel } from "#/components/admin/section-heading";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import type { BatchPhase, BatchWallet } from "#/features/paper-wallets/use-paper-wallet-batch";

const STATE: Record<BatchWallet["status"], string> = {
  queued: "queued",
  preparing: "preparing",
  registering: "registering",
  ready: "registered",
  failed: "failed",
};

const ISSUANCE_STATE: Record<CardIssuanceStatus, string> = {
  pending: "no card",
  written: "written",
  verified: "verified",
  skipped: "skipped",
};

/** Row id → physical issuance, for an NFC batch. Absent for a printed one. */
export type IssuanceByRow = Readonly<Record<number, CardIssuanceStatus>>;

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
const WalletTable = memo(function WalletTable({
  wallets,
  issuance,
}: {
  wallets: BatchWallet[];
  issuance: IssuanceByRow | null;
}) {
  const withIssuance = useMemo<Array<ColumnDef<BatchWallet>>>(() => {
    if (!issuance) return columns;
    const card: ColumnDef<BatchWallet> = {
      id: "card",
      header: "Card",
      accessorFn: (wallet) =>
        wallet.status === "ready" ? ISSUANCE_STATE[issuance[wallet.id] ?? "pending"] : "—",
      cell: ({ getValue }) => <span className="font-mono text-xs">{String(getValue())}</span>,
    };
    return [columns[0]!, columns[1]!, columns[4]!, card, columns[5]!];
  }, [issuance]);
  return <DataTable columns={withIssuance} data={wallets} />;
});

type BatchResultsProps = {
  wallets: BatchWallet[];
  phase: BatchPhase;
  encrypted: number;
  toEncrypt: number;
  onDownloadManifest: () => void;
  onRetryFailed: () => void;
  onReset: () => void;
} & (
  | {
      carrier?: "print";
      renderStage: "preparing" | "cards" | "assembling" | null;
      rendered: number;
      pdfDownloaded: boolean;
      onDownloadPdf: () => void;
    }
  | { carrier: "nfc"; issuance: IssuanceByRow }
);

export function BatchResults(props: BatchResultsProps) {
  const { wallets, phase, encrypted, toEncrypt, onDownloadManifest, onRetryFailed, onReset } =
    props;
  const print = props.carrier !== "nfc";
  const issuance = props.carrier === "nfc" ? props.issuance : null;
  const renderStage = print ? props.renderStage : null;
  const rendered = print ? props.rendered : 0;
  const ready = wallets.filter((wallet) => wallet.status === "ready").length;
  const failed = wallets.filter((wallet) => wallet.status === "failed").length;
  const busy = phase === "preparing";
  const rendering = renderStage !== null;

  const progress =
    phase === "preparing"
      ? toEncrypt > 0
        ? `Preparing wallets… ${encrypted} / ${toEncrypt} encrypted · ${ready + failed} / ${wallets.length} registered`
        : `Registering accounts… ${ready + failed} / ${wallets.length}`
      : renderStage === "preparing"
        ? "Preparing card design…"
        : renderStage === "cards"
          ? `Drawing cards… ${rendered} / ${ready}`
          : renderStage === "assembling"
            ? "Assembling PDF…"
            : `${ready} of ${wallets.length} registered${failed ? `, ${failed} failed` : ""}.`;

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
          {print && phase === "done" && !props.pdfDownloaded ? (
            <p className="text-muted-foreground text-xs">
              Download the PDF before leaving. Keys cannot be recovered.
            </p>
          ) : null}
          {props.carrier === "nfc" &&
          (busy ||
            wallets.some(
              (wallet) =>
                wallet.status === "ready" &&
                !["written", "verified"].includes(issuance?.[wallet.id] ?? "pending"),
            )) ? (
            <p className="text-muted-foreground text-xs">
              Keep this page open until all cards are written. Keys cannot be recovered.
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
          {print ? (
            <Button
              type="button"
              disabled={busy || rendering || ready === 0}
              onClick={props.onDownloadPdf}
            >
              {rendering ? <FiLoader className="animate-spin" /> : <HiOutlinePrinter />}
              {rendering ? "Creating PDF…" : `Download A4 PDF (${ready})`}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={busy || rendering} onClick={onReset}>
            New batch
          </Button>
        </div>
      </div>
      <WalletTable wallets={wallets} issuance={issuance} />
    </div>
  );
}
