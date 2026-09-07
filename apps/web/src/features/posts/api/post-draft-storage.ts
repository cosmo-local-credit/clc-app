import { reportDraftSchema, type ReportWrite } from "@clc/core/features/reports/logic";

/**
 * The one unsent post an author has in progress, kept across reloads.
 *
 * A post is long-form — a title, body, dates, photos, linked vouchers — and the
 * editor is a screen a phone will happily discard while a photo is picked or a
 * call comes in. So the form's values are parked here on every change and read
 * back the next time the editor opens.
 *
 * Two bounds, following `last-location-storage`:
 *
 * - **Scoped to an owner.** A draft is what someone wrote; the next account to
 *   use the device must never inherit it, and a lapsed session is not a
 *   sign-out.
 * - **Expired after {@link MAX_POST_DRAFT_AGE_MS}.** A draft nobody came back
 *   to is not worth restoring into a form a week later.
 *
 * Only the create screen uses it. A draft of an *existing* post would compete
 * with the server's copy of that post, and the copy that wins would depend on
 * which screen was opened last.
 */
export type PersistedPostDraft = {
  /** Lowercased wallet address of the author. */
  owner: string;
  savedAt: string;
  values: ReportWrite;
};

export const MAX_POST_DRAFT_AGE_MS = 7 * 24 * 60 * 60_000;

const STORAGE_KEY = "clc_post_draft_v1";

export function readPostDraft(owner: string): ReportWrite | null {
  const raw = getStorage()?.getItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.owner !== "string" || candidate.owner !== owner) return null;
  if (typeof candidate.savedAt !== "string" || Number.isNaN(Date.parse(candidate.savedAt))) {
    return null;
  }
  if (!(Date.now() - Date.parse(candidate.savedAt) < MAX_POST_DRAFT_AGE_MS)) {
    clearPostDraft();
    return null;
  }

  // Shape and limits, not readiness: a draft is unfinished by definition.
  const values = reportDraftSchema.safeParse(candidate.values);
  return values.success ? values.data : null;
}

export function writePostDraft(owner: string, values: ReportWrite): void {
  const draft: PersistedPostDraft = { owner, savedAt: new Date().toISOString(), values };
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // A full or blocked store must never break the editor being typed into.
  }
}

export function clearPostDraft(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the caller is already past the point the draft mattered.
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
