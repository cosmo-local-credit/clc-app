import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHAIN_ID } from "#/lib/chain";

/** The Safe transaction this app proposed for an asset, so a reload resumes it. */
export type SafeSubmission = {
  safe: `0x${string}`;
  safeTxHash: `0x${string}`;
  nonce: string;
};

export const safeSubmissionKey = (assetAddress: string) =>
  `${CHAIN_ID}:${assetAddress.toLowerCase()}`;

export const useSafeSubmissions = create(
  persist<{
    submissions: Record<string, SafeSubmission>;
    save: (assetAddress: string, submission: SafeSubmission) => void;
    remove: (assetAddress: string) => void;
  }>(
    (set) => ({
      submissions: {},
      save: (assetAddress, submission) =>
        set((state) => ({
          submissions: { ...state.submissions, [safeSubmissionKey(assetAddress)]: submission },
        })),
      remove: (assetAddress) =>
        set((state) => {
          const submissions = { ...state.submissions };
          delete submissions[safeSubmissionKey(assetAddress)];
          return { submissions };
        }),
    }),
    { name: "clc.safe-submissions" },
  ),
);
