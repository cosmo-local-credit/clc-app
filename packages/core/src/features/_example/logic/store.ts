import { create } from "zustand";

type ExampleState = {
	lastGreeted: string | null;
	setLastGreeted: (name: string) => void;
};

export const useExampleStore = create<ExampleState>((set) => ({
	lastGreeted: null,
	setLastGreeted: (name) => set({ lastGreeted: name }),
}));
