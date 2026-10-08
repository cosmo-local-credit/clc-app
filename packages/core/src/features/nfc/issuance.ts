import {
  type NfcErrorKind,
  type NfcReading,
  nfcReadingMatchesUrl,
  nfcRecordText,
  readNfcCardContent,
} from "./logic";

/**
 * Writing a prepared paper-wallet batch onto NFC cards, one card at a time.
 *
 * Registration and physical issuance are separate facts: an account created
 * on the backend says nothing about whether its card was written. A row enters
 * the writer's queue only once registered, and this module tracks what has
 * happened to it physically:
 *
 * ```text
 * queued -> preparing -> registered -> ready -> writing -> written
 *                                                       -> verified (when checked)
 * ```
 *
 * Every failure stays attached to the row it happened to. A failed or
 * uncertain write is retried with the same payload — never a new key — and a
 * verification mismatch never marks either row issued.
 */

export type CardIssuanceStatus = "pending" | "written" | "verified" | "skipped";

export type CardIssuance = {
  status: CardIssuanceStatus;
  /** Why the row is back in the queue, or how its last card went. */
  note?: string;
};

export type OccupiedReason =
  /** The card just written is still on the reader. */
  | "card-still-present"
  /** The card already carries another wallet from this batch. */
  | "already-issued"
  /** Some other content. Never overwritten without a deliberate rewrite. */
  | "occupied";

type AttentionReason = "transfer-failed" | "verify-mismatch" | "write-error";

export type WriterPhase =
  | { phase: "idle" }
  /** A write is armed for `rowId`; the next blank card presented receives it. */
  | { phase: "waiting"; rowId: number; armId: number; overwrite: boolean }
  /** Written; waiting for a fresh read of the card. `retap` once the held card gave none. */
  | { phase: "verifying"; rowId: number; armId: number; retap: boolean }
  /** The card was refused as not blank. The same row re-arms shortly. */
  | {
      phase: "blocked";
      rowId: number;
      armId: number;
      reason: OccupiedReason;
      issuedRowId?: number;
    }
  /** The card may be half-written or wrong. The operator decides; nothing advances. */
  | { phase: "attention"; rowId: number; reason: AttentionReason }
  | { phase: "paused"; rowId: number | null }
  | { phase: "stopped"; error: NfcErrorKind }
  /** Every registered row is issued, but more are still being prepared. */
  | { phase: "starved" }
  | { phase: "finished" };

export type WriterModel = {
  phase: WriterPhase;
  /** Row id → physical state. A row with no entry is pending. */
  issuance: Readonly<Record<number, CardIssuance>>;
  /** Cards put in the separate pile after an uncertain write. */
  setAside: number;
  /** Bumped for every armed operation, so an effect keyed on it runs once per arm. */
  nextArmId: number;
  /** Write-and-verify, or the explicit fast write-only mode. */
  verify: boolean;
};

export function createWriterModel(verify = true): WriterModel {
  return { phase: { phase: "idle" }, issuance: {}, setAside: 0, nextArmId: 1, verify };
}

export type WriterContext = {
  /** Registered rows, in batch order. Only these can be written. */
  readyIds: readonly number[];
  /** Rows are still being encrypted or registered. */
  preparing: boolean;
};

export type WriterEvent =
  /** Start, resume, or the deliberate "Next card". */
  | { type: "start" }
  /** A row became ready; wakes a starved writer. */
  | { type: "rows-changed" }
  | { type: "write-succeeded"; rowId: number }
  | {
      type: "write-failed";
      rowId: number;
      error: NfcErrorKind;
      occupied?: { reason: OccupiedReason; issuedRowId?: number };
    }
  /** The re-arm after a refused card. */
  | { type: "rearm"; armId: number }
  | { type: "verify-read"; rowId: number; matches: boolean }
  | { type: "verify-timeout"; rowId: number }
  /** Keep the card as written without verifying it. */
  | { type: "skip-verify" }
  /** Try the same card again with the same payload, refusing non-blank content. */
  | { type: "retry" }
  /** Put the uncertain card in the separate pile; the row waits for a fresh blank card. */
  | { type: "set-aside" }
  /** Deliberately overwrite whatever the next card holds with this row's payload. */
  | { type: "rewrite"; rowId: number }
  | { type: "skip-row" }
  | { type: "requeue-skipped" }
  | { type: "pause" }
  | { type: "fail"; error: NfcErrorKind }
  | { type: "set-verify"; verify: boolean };

export function issuanceOf(model: WriterModel, rowId: number): CardIssuance {
  return model.issuance[rowId] ?? { status: "pending" };
}

/** The row a fresh arm would write: the first registered row still pending. */
function nextIssuableRow(
  model: WriterModel,
  readyIds: readonly number[],
  exclude?: number,
): number | null {
  for (const id of readyIds) {
    if (id !== exclude && issuanceOf(model, id).status === "pending") return id;
  }
  return null;
}

/** Physical progress, honest about the difference between written and verified. */
export function issuanceCounts(model: WriterModel, readyIds: readonly number[]) {
  let written = 0;
  let verified = 0;
  let skipped = 0;
  for (const id of readyIds) {
    const { status } = issuanceOf(model, id);
    if (status === "written") written += 1;
    if (status === "verified") verified += 1;
    if (status === "skipped") skipped += 1;
  }
  return {
    issued: written + verified,
    written,
    verified,
    skipped,
    remaining: readyIds.length - written - verified - skipped,
  };
}

function withIssuance(model: WriterModel, rowId: number, issuance: CardIssuance): WriterModel {
  return { ...model, issuance: { ...model.issuance, [rowId]: issuance } };
}

function arm(model: WriterModel, rowId: number, overwrite: boolean): WriterModel {
  return {
    ...model,
    nextArmId: model.nextArmId + 1,
    phase: { phase: "waiting", rowId, armId: model.nextArmId, overwrite },
  };
}

function advance(model: WriterModel, context: WriterContext, after?: number): WriterModel {
  const next = nextIssuableRow(model, context.readyIds, after);
  if (next !== null) return arm(model, next, false);
  return { ...model, phase: context.preparing ? { phase: "starved" } : { phase: "finished" } };
}

function currentRow(phase: WriterPhase): number | null {
  return "rowId" in phase ? phase.rowId : null;
}

/**
 * The writer's state machine. Effects — the write itself, the verification
 * read, the re-arm timer — are run by the app against the phase this returns,
 * keyed on `armId`, so each armed operation runs exactly once and a late
 * result for an earlier arm finds its row no longer current and is ignored.
 */
export function writerTransition(
  model: WriterModel,
  event: WriterEvent,
  context: WriterContext,
): WriterModel {
  const { phase } = model;
  switch (event.type) {
    case "start": {
      if (phase.phase === "waiting" || phase.phase === "verifying") return model;
      const resumeRow = phase.phase === "paused" || phase.phase === "blocked" ? phase.rowId : null;
      if (resumeRow !== null && issuanceOf(model, resumeRow).status === "pending") {
        return arm(model, resumeRow, false);
      }
      return advance(model, context);
    }
    case "rows-changed":
      return phase.phase === "starved" ? advance(model, context) : model;
    case "write-succeeded": {
      if (phase.phase !== "waiting" || phase.rowId !== event.rowId) return model;
      const written = withIssuance(model, event.rowId, { status: "written" });
      if (!model.verify) return advance(written, context, event.rowId);
      return {
        ...written,
        nextArmId: written.nextArmId + 1,
        phase: { phase: "verifying", rowId: event.rowId, armId: written.nextArmId, retap: false },
      };
    }
    case "write-failed": {
      if (phase.phase !== "waiting" || phase.rowId !== event.rowId) return model;
      switch (event.error) {
        case "aborted":
          return { ...model, phase: { phase: "paused", rowId: event.rowId } };
        case "tag-occupied":
          return {
            ...model,
            nextArmId: model.nextArmId + 1,
            phase: {
              phase: "blocked",
              rowId: event.rowId,
              armId: model.nextArmId,
              reason: event.occupied?.reason ?? "occupied",
              issuedRowId: event.occupied?.issuedRowId,
            },
          };
        case "transfer-failed":
          return {
            ...model,
            phase: { phase: "attention", rowId: event.rowId, reason: "transfer-failed" },
          };
        case "unknown":
        case "busy":
          return {
            ...model,
            phase: { phase: "attention", rowId: event.rowId, reason: "write-error" },
          };
        default:
          return { ...model, phase: { phase: "stopped", error: event.error } };
      }
    }
    case "rearm":
      if (phase.phase !== "blocked" || phase.armId !== event.armId) return model;
      return arm(model, phase.rowId, false);
    case "verify-read": {
      if (phase.phase !== "verifying" || phase.rowId !== event.rowId) return model;
      if (event.matches) {
        return advance(
          withIssuance(model, event.rowId, { status: "verified" }),
          context,
          event.rowId,
        );
      }
      // Not issued: the card read back as something other than this row's record.
      return {
        ...withIssuance(model, event.rowId, {
          status: "pending",
          note: "Verification read did not match; card not issued",
        }),
        phase: { phase: "attention", rowId: event.rowId, reason: "verify-mismatch" },
      };
    }
    case "verify-timeout":
      if (phase.phase !== "verifying" || phase.rowId !== event.rowId || phase.retap) return model;
      return {
        ...model,
        nextArmId: model.nextArmId + 1,
        phase: { ...phase, armId: model.nextArmId, retap: true },
      };
    case "skip-verify":
      if (phase.phase !== "verifying") return model;
      return advance(model, context, phase.rowId);
    case "retry":
      if (phase.phase !== "attention") return model;
      return arm(model, phase.rowId, false);
    case "set-aside":
      if (phase.phase !== "attention") return model;
      return arm(
        {
          ...withIssuance(model, phase.rowId, {
            status: "pending",
            note: "A card was set aside after an uncertain write",
          }),
          setAside: model.setAside + 1,
        },
        phase.rowId,
        false,
      );
    case "rewrite": {
      if (phase.phase === "waiting" || phase.phase === "verifying") {
        if (phase.rowId !== event.rowId) return model;
      }
      if (!context.readyIds.includes(event.rowId)) return model;
      return arm(model, event.rowId, true);
    }
    case "skip-row": {
      const rowId = currentRow(phase);
      if (rowId === null || phase.phase === "verifying") return model;
      return advance(withIssuance(model, rowId, { status: "skipped" }), context, rowId);
    }
    case "requeue-skipped": {
      const issuance = Object.fromEntries(
        Object.entries(model.issuance).map(([id, entry]) => [
          id,
          entry.status === "skipped" ? { status: "pending" as const } : entry,
        ]),
      );
      return { ...model, issuance };
    }
    case "pause":
      if (phase.phase === "idle" || phase.phase === "finished" || phase.phase === "stopped") {
        return model;
      }
      // A row mid-verification is already written; resuming moves on from it.
      return {
        ...model,
        phase: { phase: "paused", rowId: phase.phase === "verifying" ? null : currentRow(phase) },
      };
    case "fail":
      return { ...model, phase: { phase: "stopped", error: event.error } };
    case "set-verify":
      return { ...model, verify: event.verify };
  }
}

/**
 * Why a card was refused as not blank, from the reading the platform
 * dispatched while the write was pending.
 *
 * Serial numbers are compared only when both sides have one; their absence is
 * normal and is never treated as a match.
 */
export function classifyOccupiedCard(input: {
  observed: NfcReading | null;
  previousCard: { serialNumber: string | null; url: string } | null;
  /** Every prepared URL in the batch, mapped to its row. */
  rowForUrl: (url: string) => number | null;
}): { reason: OccupiedReason; issuedRowId?: number } {
  const { observed, previousCard } = input;
  if (!observed) return { reason: "occupied" };
  if (
    previousCard?.serialNumber &&
    observed.serialNumber &&
    previousCard.serialNumber === observed.serialNumber
  ) {
    return { reason: "card-still-present" };
  }
  if (previousCard && nfcReadingMatchesUrl(observed, previousCard.url)) {
    return { reason: "card-still-present" };
  }
  const content = readNfcCardContent(observed);
  if (content.kind === "credential") {
    for (const record of observed.records) {
      const text = nfcRecordText(record);
      const rowId = text === null ? null : input.rowForUrl(text);
      if (rowId !== null) return { reason: "already-issued", issuedRowId: rowId };
    }
  }
  return { reason: "occupied" };
}
