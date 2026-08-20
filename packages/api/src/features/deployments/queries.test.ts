import { describe, expect, it } from "vite-plus/test";
import type { DeploymentsClient } from "./client";
import { deploymentKeys, tokenTagsQueryOptions } from "./queries";

describe("deploymentKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    for (const key of [
      deploymentKeys.tokenTags(),
      deploymentKeys.contract("SWAP_POOL", "track-1"),
    ]) {
      expect(key.slice(0, deploymentKeys.all.length)).toEqual([...deploymentKeys.all]);
    }
  });
});

describe("tokenTagsQueryOptions", () => {
  it("caches tags for five minutes", () => {
    expect(tokenTagsQueryOptions({} as DeploymentsClient).staleTime).toBe(5 * 60_000);
  });
});
