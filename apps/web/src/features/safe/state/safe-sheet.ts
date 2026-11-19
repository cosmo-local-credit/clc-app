import { create } from "zustand";

/** Which Safe's pending transactions the sheet shows; null keeps it closed. */
export const useSafeSheet = create<{
  safe: `0x${string}` | null;
  safeTxHash: `0x${string}` | null;
  show: (safe: `0x${string}`, safeTxHash?: `0x${string}`) => void;
  close: () => void;
}>((set) => ({
  safe: null,
  safeTxHash: null,
  show: (safe, safeTxHash) => set({ safe, safeTxHash: safeTxHash ?? null }),
  close: () => set({ safe: null, safeTxHash: null }),
}));
