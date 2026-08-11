import type { VoucherCreateInput } from "@clc/core/features/vouchers/logic";
import { create } from "zustand";

type VoucherCreateDraftState = {
  draft: VoucherCreateInput | null;
  setDraft: (draft: VoucherCreateInput) => void;
  clearDraft: () => void;
};

export const useVoucherCreateDraft = create<VoucherCreateDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
