import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHAIN_ID } from "#/lib/chain";

export type OwnershipSubmission = {
  trackingId: string;
  ownerAddress: `0x${string}`;
  newOwnerAddress: `0x${string}`;
  confirmed: boolean;
  txHash?: `0x${string}`;
};

export const ownershipKey = (address: string) => `${CHAIN_ID}:${address.toLowerCase()}`;

export const useOwnershipSubmissions = create(
  persist<{
    submissions: Record<string, OwnershipSubmission>;
    save: (address: string, submission: OwnershipSubmission) => void;
    remove: (address: string) => void;
  }>(
    (set) => ({
      submissions: {},
      save: (address, submission) =>
        set((state) => ({
          submissions: { ...state.submissions, [ownershipKey(address)]: submission },
        })),
      remove: (address) =>
        set((state) => {
          const submissions = { ...state.submissions };
          delete submissions[ownershipKey(address)];
          return { submissions };
        }),
    }),
    { name: "clc.ownership-submissions" },
  ),
);

/** Persist before waiting: a reload must resume tracking rather than sign again. */
export function saveOwnershipSubmission(address: string, submission: OwnershipSubmission) {
  useOwnershipSubmissions.getState().save(address, submission);
  // Zustand's storage can be unavailable (private mode / quota). Do not pretend
  // the accepted tracking ID is durable in that case.
  let persisted: string | null = null;
  try {
    persisted = localStorage.getItem("clc.ownership-submissions");
  } catch {
    // Blocked storage reads as unsaved below.
  }
  if (!persisted?.includes(submission.trackingId)) {
    throw new Error(
      `Submission ${submission.trackingId} was accepted. Keep this ID and check settlement before trying again.`,
    );
  }
}
