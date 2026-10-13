import { create } from "zustand";

export const useMarketplaceSearchShell = create<{
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
}>((set) => ({
  collapsed: false,
  collapse: () => set({ collapsed: true }),
  expand: () => set({ collapsed: false }),
}));
