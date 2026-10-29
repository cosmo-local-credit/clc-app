import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";

/**
 * Work in progress that survives the phone/desktop view swap, and nothing else.
 *
 * The layout switch unmounts one view tree and mounts the other when the
 * viewport crosses the desktop breakpoint (a browser zoom, a window resize), so
 * component state is lost mid-task. A view draft bridges exactly that: the
 * view that is going away leaves its field values here, the view that arrives
 * takes them back.
 *
 * What makes it safe for a payment app is what it refuses to be. It is not a
 * saved draft. An entry is only ever handed to a mount in the OTHER layout than
 * the one that wrote it, which is what a switch is. A mount in the same layout
 * (someone left the flow and came back, or an old entry nobody claimed) finds
 * the entry discarded, never restored. Leaving the flow while the layout stays
 * put deletes the entry as well, so a draft cannot reappear on a later visit.
 *
 * The order this relies on, which `layout.ts` (in the desktop layer, not
 * imported here) provides: when the media query changes it writes
 * `data-layout` on `<html>` FIRST and only then tells React, so by the time the
 * old tree unmounts the attribute already names the new layout, and the new
 * tree renders against it. Both views read it through `currentLayout()` below.
 * React also runs every unmount cleanup before any mount effect of the same
 * commit, so the old tree's cleanup (entry kept: layouts differ) comes before
 * the new tree's effect (entry re-saved under the new layout).
 *
 * Memory only. Nothing here touches `localStorage` or `sessionStorage`, and a
 * reload starts clean. Callers store plain field values: never keys, passwords,
 * paper-wallet material, sessions, files or blob URLs, and nothing that arms a
 * transaction (a confirmation, a "use the whole balance" flag). `save` also
 * refuses a value that carries a file, a blob or data URL, or a secret-shaped
 * key, as a second line behind the callers.
 */

type DraftLayout = "mobile" | "desktop";

type DraftEntry = { value: unknown; layout: DraftLayout };

type ViewDraftState = {
  entries: Record<string, DraftEntry>;
};

export const useViewDraftStore = create<ViewDraftState>(() => ({ entries: {} }));

/**
 * How long an entry survives with nobody to claim it after its view went
 * away because of a switch. A switch is followed at once by the other view's
 * mount; this only matters when that mount never comes (the desktop chunk was
 * slow and the person left the page), so the draft cannot wait for a later
 * visit in the other layout.
 */
const UNCLAIMED_TTL_MS = 30_000;

/** The layout `layout.ts` last wrote on `<html>`; mobile when there is nothing to read. */
function currentLayout(): DraftLayout {
  if (typeof document === "undefined") return "mobile";
  return document.documentElement.dataset.layout === "desktop" ? "desktop" : "mobile";
}

function draftKey(account: string | null | undefined, scope: string): string | null {
  const owner = account?.trim().toLowerCase();
  return owner ? `${owner}:${scope}` : null;
}

function putEntry(key: string, entry: DraftEntry) {
  useViewDraftStore.setState((state) => ({ entries: { ...state.entries, [key]: entry } }));
}

function removeEntry(key: string) {
  const { entries } = useViewDraftStore.getState();
  if (!(key in entries)) return;
  const rest = { ...entries };
  delete rest[key];
  useViewDraftStore.setState({ entries: rest });
}

/** Drops everything: a sign-out or an account change must leave no draft behind. */
export function clearViewDrafts() {
  useViewDraftStore.setState({ entries: {} });
}

/** `blob:` object URLs die with their page; `data:` URLs embed a file. Text that merely starts with "data:" is not one. */
const LOCAL_URL = /^(blob:(https?|null)|data:[a-z]+\/[\w.+-]+\s*[;,])/i;
const SECRET_KEY = /private|secret|password|passphrase|mnemonic|seed|credential|jwt|session/i;

/** A file, a blob or data URL, or a secret-shaped key anywhere in the value. */
function carriesUnsafeData(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (typeof value === "string") return LOCAL_URL.test(value.trim());
  if (typeof value !== "object" || value === null) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (Array.isArray(value)) return value.some((item) => carriesUnsafeData(item, depth + 1));
  return Object.entries(value).some(
    ([key, item]) => SECRET_KEY.test(key) || carriesUnsafeData(item, depth + 1),
  );
}

export type ViewDraft<T> = {
  /** Set once, at mount, only when this mount follows a layout switch. */
  restored: T | undefined;
  /** Records the current field values; call it on every meaningful change. */
  save: (value: T) => void;
  /** Forgets the draft: after a submit, a discard, or when the fields are back to pristine. */
  clear: () => void;
};

/**
 * `scope` names the flow (and the resource, for an edit: `want-edit:<id>`).
 * `account` is the signed-in address; without one nothing is ever kept, so a
 * guest has no drafts.
 */
export function useViewDraft<T>({
  scope,
  account,
}: {
  scope: string;
  account: string | null | undefined;
}): ViewDraft<T> {
  const key = draftKey(account, scope);
  // The layout of the tree this instance belongs to. Entries are tagged with it
  // rather than with whatever the attribute says later, so a save that lands
  // after the flip (an async validation settling) is still tagged by its own
  // view and the switch is still recognised.
  const [layout] = useState(currentLayout);
  // Read, never written, during render: a render may be repeated or thrown away.
  const [claim] = useState(() => {
    const entry = key ? useViewDraftStore.getState().entries[key] : undefined;
    return {
      key,
      value: entry && entry.layout !== layout ? (entry.value as T) : undefined,
    };
  });
  const restored = claim.key === key ? claim.value : undefined;
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    if (!key) return;
    const entry = useViewDraftStore.getState().entries[key];
    if (claim.key === key && claim.value !== undefined) {
      // Carry it forward under this layout so a second switch restores too. A
      // newer save from this very commit already did that, and wins.
      if (!entry || entry.layout !== layout) putEntry(key, { value: claim.value, layout });
    } else if (entry) {
      // Same layout, or not meant for this mount: a draft is only a bridge.
      removeEntry(key);
    }
    return () => {
      live.current = false;
      const left = useViewDraftStore.getState().entries[key];
      if (!left) return;
      if (currentLayout() === layout) {
        // The layout did not change, so the view was left, not swapped.
        removeEntry(key);
        return;
      }
      // A switch took this view away. The other view claims the entry on mount;
      // if none ever does, it does not wait around for a later visit.
      setTimeout(() => {
        if (useViewDraftStore.getState().entries[key] === left) removeEntry(key);
      }, UNCLAIMED_TTL_MS);
    };
  }, [claim, key, layout]);

  const save = useCallback(
    (value: T) => {
      if (!key || !live.current) return;
      if (carriesUnsafeData(value)) {
        removeEntry(key);
        return;
      }
      putEntry(key, { value, layout });
    },
    [key, layout],
  );
  const clear = useCallback(() => {
    if (key) removeEntry(key);
  }, [key]);

  return { restored, save, clear };
}
