import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const store = new Map<string, string>();

const localStorageMock: Storage = {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => {
		store.set(key, value);
	},
	removeItem: (key: string) => {
		store.delete(key);
	},
	clear: () => {
		store.clear();
	},
	get length() {
		return store.size;
	},
	key: (index: number) => {
		const keys = Array.from(store.keys());
		return keys[index] ?? null;
	},
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });

afterEach(() => {
	cleanup();
});
