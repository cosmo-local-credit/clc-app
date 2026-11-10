import { create } from "zustand";

type PaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
