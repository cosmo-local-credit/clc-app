import type { RelayPayload } from "@clc/api/features/relayer/client";
import type { CollectToken } from "@clc/core/features/nfc/collect";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CollectSubmissionStatus = "pending" | "confirmed" | "failed" | "unknown";

/**
 * One collected payment, as much of it as a reload needs to carry on: public
 * intent metadata, the tracking id once known, and — only until then — the
 * signed request that proves the submission and can be resent unchanged.
 *
 * Never the payer's key. The signed request authorizes this one transfer and
 * dies at its deadline; it is dropped as soon as a tracking id comes back.
 */
export type CollectSubmission = {
  /** The intent id, which is also the relay operation id. */
  operationId: string;
  collector: `0x${string}`;
  payer: `0x${string}`;
  token: CollectToken;
  amountLabel: string;
  createdAt: number;
  /** Unix ms after which the signed request can no longer execute. */
  expiresAt: number;
  trackingId: string | null;
  request: RelayPayload | null;
  status: CollectSubmissionStatus;
};

/** Enough history for a collector's recent list; older rows are settled anyway. */
const MAX_SUBMISSIONS = 20;

type CollectSubmissionsState = {
  submissions: CollectSubmission[];
  add: (submission: CollectSubmission) => void;
  update: (operationId: string, patch: Partial<CollectSubmission>) => void;
  /** A request with no tracking id past its deadline can no longer be resolved. */
  expire: (now: number) => void;
};

/**
 * Reload recovery for card collection, in this tab's `sessionStorage`.
 *
 * A row keeps its signed request only while it has neither a tracking id nor
 * a final status, and `expire` turns one past its deadline into `unknown`.
 */
export const useCollectSubmissions = create<CollectSubmissionsState>()(
  persist(
    (set) => ({
      submissions: [],
      add: (submission) =>
        set((state) => ({
          submissions: [
            submission,
            ...state.submissions.filter((entry) => entry.operationId !== submission.operationId),
          ].slice(0, MAX_SUBMISSIONS),
        })),
      update: (operationId, patch) =>
        set((state) => ({
          submissions: state.submissions.map((entry) => {
            if (entry.operationId !== operationId) return entry;
            const next = { ...entry, ...patch };
            // The proof is only for finding the submission again.
            return next.trackingId || next.status !== "pending" ? { ...next, request: null } : next;
          }),
        })),
      expire: (now) =>
        set((state) => ({
          submissions: state.submissions.map((entry) =>
            entry.status === "pending" && !entry.trackingId && entry.expiresAt <= now
              ? { ...entry, status: "unknown", request: null }
              : entry,
          ),
        })),
    }),
    {
      name: "clc.collect.submissions",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated by the collect page after mount, so the server render and
      // the first client render agree.
      skipHydration: true,
    },
  ),
);
