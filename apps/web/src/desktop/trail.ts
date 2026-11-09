import { useEffect } from "react";
import { create } from "zustand";

type TrailState = {
  label: string | null;
  setLabel: (label: string | null) => void;
};

export const useDeskTrail = create<TrailState>((set) => ({
  label: null,
  setLabel: (label) => set({ label }),
}));

/** The entity name the shell appends to the breadcrumb. Cleared on unmount. */
export function useDeskTrailLabel(label: string | null | undefined) {
  const setLabel = useDeskTrail((state) => state.setLabel);
  useEffect(() => {
    setLabel(label ?? null);
    return () => setLabel(null);
  }, [label, setLabel]);
}
