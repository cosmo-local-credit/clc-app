import { describe, expect, it } from "vite-plus/test";
import type { SymbolsClient } from "./client";
import { symbolKeys, takenSymbolsQueryOptions } from "./queries";

describe("symbolKeys", () => {
  it("hangs the taken key off `all` so one invalidation reaches it", () => {
    const key = symbolKeys.taken("voucher", "KVKS");
    expect(key.slice(0, symbolKeys.all.length)).toEqual([...symbolKeys.all]);
    expect(key).not.toEqual(symbolKeys.taken("pool", "KVKS"));
  });
});

describe("takenSymbolsQueryOptions", () => {
  it("keeps occupancy fresh for thirty seconds and does not retry", () => {
    const options = takenSymbolsQueryOptions({} as SymbolsClient, "pool", "KGP");
    expect(options.staleTime).toBe(30_000);
    expect(options.retry).toBe(false);
  });
});
