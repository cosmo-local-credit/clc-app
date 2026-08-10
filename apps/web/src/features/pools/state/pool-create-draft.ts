import type { PoolCreateInput } from "@clc/core/features/pools/logic";
import { create } from "zustand";

type PoolCreateDraftState = {
  draft: PoolCreateInput | null;
  setDraft: (draft: PoolCreateInput) => void;
  clearDraft: () => void;
};

export const usePoolCreateDraft = create<PoolCreateDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
