import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { CardIssuanceStatus, WriterPhase } from "@clc/core/features/nfc/issuance";
import { issuanceOf } from "@clc/core/features/nfc/issuance";
import {
  NFC_TAG_CAPACITIES,
  ndefMessageFits,
  ndefUrlMessageSize,
  type NfcErrorKind,
} from "@clc/core/features/nfc/logic";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  HiOutlineArrowRight,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineX,
} from "react-icons/hi";
import { MdOutlineNfc } from "react-icons/md";

import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Switch } from "#/components/ui/switch";
import { cn } from "#/lib/utils";
import type { BatchWallet } from "../use-paper-wallet-batch";
import type { NfcWriterController } from "./use-nfc-writer";

/*
 * The one admin surface laid out for a phone (see CLAUDE.md, "Admin console UI
 * rules"): base classes target a 360–430px screen held in one hand, and
 * breakpoints only widen it. Buttons are h-12 for a thumb, not the console's h-9.
 */

type Tone = "idle" | "active" | "success" | "warning" | "error";

type Status = { headline: string; detail: string; tone: Tone };

const STOPPED: Record<NfcErrorKind, Status> = {
  "permission-denied": {
    headline: "NFC permission denied",
    detail: "Allow NFC for this site in Chrome's site settings, then start again.",
    tone: "error",
  },
  disabled: {
    headline: "NFC is off",
    detail: "Turn on NFC in Android settings, then start again.",
    tone: "error",
  },
  unsupported: {
    headline: "This device cannot write NFC cards",
    detail: "Open this page in Chrome on an Android phone with NFC.",
    tone: "error",
  },
  busy: {
    headline: "NFC is busy",
    detail: "Another tab or app is using NFC. Close it, then start again.",
    tone: "error",
  },
  aborted: { headline: "Stopped", detail: "Start again when ready.", tone: "idle" },
  "tag-occupied": { headline: "Use a blank card", detail: "", tone: "warning" },
  "transfer-failed": { headline: "Write interrupted", detail: "", tone: "error" },
  unknown: {
    headline: "NFC failed",
    detail: "Start again. If it keeps failing, reload the page.",
    tone: "error",
  },
};

function describe(
  phase: WriterPhase,
  {
    canStart,
    ready,
    eligible,
    justWrote,
    skipped,
  }: { canStart: boolean; ready: number; eligible: number; justWrote: boolean; skipped: number },
): Status {
  switch (phase.phase) {
    case "idle":
      return canStart
        ? {
            headline: "Ready to write",
            detail: "Start, then present the first blank card.",
            tone: "idle",
          }
        : {
            headline: "Preparing wallets",
            detail: `${ready} of ${eligible} ready. Writing can start once a few are registered.`,
            tone: "idle",
          };
    case "waiting":
      if (phase.overwrite) {
        return {
          headline: "Present the card to overwrite",
          detail: "Whatever it holds will be replaced with this wallet.",
          tone: "warning",
        };
      }
      return justWrote
        ? {
            headline: "Remove card · present next card",
            detail: "Hold the next blank card steady against the back of the phone.",
            tone: "success",
          }
        : {
            headline: "Present a blank card",
            detail: "Hold it steady against the back of the phone.",
            tone: "active",
          };
    case "verifying":
      return phase.retap
        ? {
            headline: "Tap the card again to verify",
            detail: "It was written but did not read back while held.",
            tone: "active",
          }
        : { headline: "Written · verifying", detail: "Keep holding the card.", tone: "success" };
    case "blocked":
      if (phase.reason === "card-still-present") {
        return {
          headline: "Remove card · present next card",
          detail: "The card on the reader is the one just written.",
          tone: "warning",
        };
      }
      if (phase.reason === "already-issued" && phase.issuedRowId !== undefined) {
        return {
          headline: "Use a blank card",
          detail: `This card already holds wallet #${phase.issuedRowId + 1}. It was not changed.`,
          tone: "warning",
        };
      }
      return {
        headline: "Use a blank card",
        detail: "This card already holds data. It was not changed.",
        tone: "warning",
      };
    case "attention":
      if (phase.reason === "verify-mismatch") {
        return {
          headline: "Card does not match",
          detail: "It read back differently and is not issued. Retry it or set it aside.",
          tone: "error",
        };
      }
      return {
        headline: phase.reason === "transfer-failed" ? "Write interrupted" : "Write failed",
        detail: "The card may be partly written. Retry it, or set it aside and use a new card.",
        tone: "error",
      };
    case "paused":
      return {
        headline: "Paused",
        detail: "Nothing is written while paused. Resume when the next card is ready.",
        tone: "idle",
      };
    case "stopped":
      return STOPPED[phase.error];
    case "starved":
      return {
        headline: "Waiting for wallets",
        detail: `${ready} of ${eligible} prepared. The next card starts as soon as one is ready.`,
        tone: "idle",
      };
    case "finished":
      return {
        headline: skipped > 0 ? "Batch done with skipped rows" : "All cards written",
        detail:
          skipped > 0
            ? `${skipped} skipped rows have no card yet.`
            : "Every registered wallet has a card.",
        tone: skipped > 0 ? "warning" : "success",
      };
  }
}

const TONE_CLASS: Record<Tone, string> = {
  idle: "border-border bg-background",
  active: "border-primary bg-primary/5",
  success: "border-state-active bg-state-active/10",
  warning: "border-state-pending bg-state-pending/10",
  error: "border-destructive bg-destructive/10",
};

const ISSUANCE_LABEL: Record<CardIssuanceStatus, string> = {
  pending: "no card",
  written: "written",
  verified: "verified",
  skipped: "skipped",
};

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-card p-3">
      <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-data text-xl font-semibold">{value}</p>
    </div>
  );
}

function ms(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function confirmRewrite(rowId: number): boolean {
  return window.confirm(
    `Overwrite the next card presented with wallet #${rowId + 1}? Whatever that card holds will be lost.`,
  );
}

export function NfcWriterPanel({
  writer,
  wallets,
  urlFor,
}: {
  writer: NfcWriterController;
  wallets: readonly BatchWallet[];
  urlFor: (rowId: number) => string | null;
}) {
  const { model, counts, readyIds, stats } = writer;
  const phase = model.phase;
  const rowId = "rowId" in phase ? phase.rowId : null;
  const row = rowId === null ? null : wallets.find((wallet) => wallet.id === rowId);
  const eligible = wallets.filter((wallet) => wallet.status !== "failed").length;
  const justWrote =
    writer.lastWritten !== null && rowId !== null && writer.lastWritten.rowId !== rowId;
  const status = describe(phase, {
    canStart: writer.canStart,
    ready: readyIds.length,
    eligible,
    justWrote,
    skipped: counts.skipped,
  });

  // A brief flash on each successful write, on top of the vibration and beep.
  const [flash, setFlash] = useState(false);
  const flashAt = writer.lastWritten?.at;
  useEffect(() => {
    if (flashAt === undefined) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 600);
    return () => window.clearTimeout(timer);
  }, [flashAt]);

  const messageSize = readyIds.reduce((largest, id) => {
    const url = urlFor(id);
    return url ? Math.max(largest, ndefUrlMessageSize(url)) : largest;
  }, 0);
  const smallestTag = NFC_TAG_CAPACITIES.find((tag) => ndefMessageFits(messageSize, tag.bytes));

  const busy = phase.phase === "waiting" || phase.phase === "verifying";
  const issued = counts.issued;
  const total = readyIds.length;

  return (
    <section
      className="flex flex-col gap-4 border border-border bg-card p-4"
      aria-label="NFC card writer"
    >
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>NFC card writer</SectionLabel>
        <label htmlFor="nfc-verify" className="flex min-h-9 items-center gap-2 text-sm">
          <Switch
            id="nfc-verify"
            checked={model.verify}
            onCheckedChange={(checked) => writer.setVerify(checked === true)}
          />
          Verify each card
        </label>
      </div>

      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        <Figure label="Written" value={counts.written + counts.verified} />
        <Figure label="Verified" value={counts.verified} />
        <Figure label="Remaining" value={counts.remaining} />
        <Figure label="Set aside" value={model.setAside} />
      </div>

      <div
        role="progressbar"
        aria-label="Cards issued"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={issued}
        className="h-2 w-full overflow-hidden bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${total ? (issued / total) * 100 : 0}%` }}
        />
      </div>

      <div
        role="status"
        aria-live="assertive"
        className={cn(
          "flex min-h-44 flex-col items-center justify-center gap-2 border-2 p-4 text-center transition-colors",
          TONE_CLASS[status.tone],
          flash && "bg-state-active/30",
        )}
      >
        <MdOutlineNfc className="size-8 text-muted-foreground" aria-hidden="true" />
        {row ? (
          <p className="font-data text-xs text-muted-foreground">
            #{row.id + 1}
            {row.recipient.name ? ` · ${row.recipient.name}` : ""} ·{" "}
            <span className="font-mono">{formatVoucherAddress(row.address)}</span>
          </p>
        ) : null}
        <p className="font-heading text-xl font-semibold leading-tight">{status.headline}</p>
        {status.detail ? <p className="text-muted-foreground text-sm">{status.detail}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {phase.phase === "idle" || phase.phase === "stopped" ? (
          <Button className="col-span-2 h-12" disabled={!writer.canStart} onClick={writer.start}>
            <HiOutlinePlay />
            Start writing
          </Button>
        ) : null}
        {phase.phase === "paused" ? (
          <Button className="col-span-2 h-12" onClick={writer.start}>
            <HiOutlinePlay />
            Resume
          </Button>
        ) : null}
        {phase.phase === "finished" && counts.remaining > 0 ? (
          <Button className="col-span-2 h-12" onClick={writer.start}>
            <HiOutlinePlay />
            Write {counts.remaining} remaining
          </Button>
        ) : null}
        {phase.phase === "finished" && counts.skipped > 0 ? (
          <Button
            variant="outline"
            className="col-span-2 h-12"
            onClick={() => {
              writer.requeueSkipped();
              writer.start();
            }}
          >
            <HiOutlineRefresh />
            Write {counts.skipped} skipped
          </Button>
        ) : null}
        {phase.phase === "blocked" ? (
          <Button className="col-span-2 h-12" onClick={writer.start}>
            <HiOutlineArrowRight />
            Next card
          </Button>
        ) : null}
        {phase.phase === "attention" ? (
          <>
            <Button className="h-12" onClick={writer.retry}>
              <HiOutlineRefresh />
              Retry card
            </Button>
            <Button variant="outline" className="h-12" onClick={writer.setAside}>
              Set card aside
            </Button>
          </>
        ) : null}
        {phase.phase === "verifying" ? (
          <Button variant="outline" className="col-span-2 h-12" onClick={writer.keepUnverified}>
            Keep unverified
          </Button>
        ) : null}
        {phase.phase === "waiting" ||
        phase.phase === "blocked" ||
        phase.phase === "verifying" ||
        phase.phase === "starved" ? (
          <Button variant="outline" className="h-12" onClick={writer.pause}>
            <HiOutlinePause />
            Pause
          </Button>
        ) : null}
        {phase.phase === "waiting" || phase.phase === "blocked" || phase.phase === "attention" ? (
          <Button variant="ghost" className="h-12" onClick={writer.skipRow}>
            <HiOutlineX />
            Skip row
          </Button>
        ) : null}
        {(phase.phase === "blocked" || phase.phase === "attention") && rowId !== null ? (
          <Button
            variant="destructive"
            className="col-span-2 h-12"
            onClick={() => {
              if (confirmRewrite(rowId)) writer.rewrite(rowId);
            }}
          >
            Rewrite this card (overwrite)
          </Button>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <dt className="text-muted-foreground">Card payload</dt>
        <dd className="font-data">
          {messageSize
            ? `${messageSize} B · ${smallestTag ? `fits ${smallestTag.name}` : "too large"}`
            : "—"}
        </dd>
        <dt className="text-muted-foreground">Write p50 / p95</dt>
        <dd className="font-data">
          {ms(stats.writeP50)} / {ms(stats.writeP95)}
        </dd>
        <dt className="text-muted-foreground">Verify p50</dt>
        <dd className="font-data">{ms(stats.verifyP50)}</dd>
        <dt className="text-muted-foreground">Cards / minute</dt>
        <dd className="font-data">
          {stats.cardsPerMinute === null ? "—" : stats.cardsPerMinute.toFixed(1)}
        </dd>
      </dl>

      {total > 0 ? (
        <details className="border-t border-border pt-3">
          <summary className="min-h-9 cursor-pointer text-sm">Rows and rewrites</summary>
          <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto border border-border">
            {readyIds.map((id) => {
              const wallet = wallets.find((candidate) => candidate.id === id);
              const issuance = issuanceOf(model, id);
              return (
                <li key={id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="font-data w-10 shrink-0">#{id + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono">
                      {wallet ? formatVoucherAddress(wallet.address) : ""}
                    </span>
                    {issuance.note ? (
                      <span className="block truncate text-muted-foreground">{issuance.note}</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-[0.625rem] uppercase text-muted-foreground">
                    {ISSUANCE_LABEL[issuance.status]}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    aria-label={`Rewrite wallet #${id + 1}`}
                    onClick={() => {
                      if (confirmRewrite(id)) writer.rewrite(id);
                    }}
                  >
                    Rewrite
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
