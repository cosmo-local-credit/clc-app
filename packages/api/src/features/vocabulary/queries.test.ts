import { describe, expect, it, vi } from "vite-plus/test";
import type { VocabularyClient } from "./client";
import { customVocabularyQueryOptions, offeringUnitsQueryOptions, vocabularyKeys } from "./queries";

function stubClient(overrides: Partial<VocabularyClient> = {}) {
  return {
    getOfferingUnits: vi.fn().mockResolvedValue([]),
    getCustomVocabulary: vi.fn().mockResolvedValue({ tags: [], units: [] }),
    deleteTag: vi.fn(),
    deleteUnit: vi.fn(),
    ...overrides,
  } as unknown as VocabularyClient;
}

describe("vocabularyKeys", () => {
  // The admin delete invalidates the whole vocabulary namespace, so both reads
  // have to hang off `all` or a deleted tag survives in the pickers.
  it("nests both reads under `all`", () => {
    for (const key of [vocabularyKeys.offeringUnits(), vocabularyKeys.custom()]) {
      expect(key.slice(0, vocabularyKeys.all.length)).toEqual([...vocabularyKeys.all]);
    }
    expect(vocabularyKeys.offeringUnits()).not.toEqual(vocabularyKeys.custom());
  });
});

describe("offeringUnitsQueryOptions", () => {
  it("keeps the unit list fresh for five minutes", () => {
    expect(offeringUnitsQueryOptions(stubClient()).staleTime).toBe(5 * 60_000);
  });

  it("passes the query's signal through so an abandoned picker cancels its read", async () => {
    const getOfferingUnits = vi.fn().mockResolvedValue(["kg"]);
    const options = offeringUnitsQueryOptions(stubClient({ getOfferingUnits }));
    const signal = new AbortController().signal;

    await expect(
      options.queryFn?.({ signal } as Parameters<NonNullable<typeof options.queryFn>>[0]),
    ).resolves.toEqual(["kg"]);
    expect(getOfferingUnits).toHaveBeenCalledWith(signal);
  });
});

describe("customVocabularyQueryOptions", () => {
  // The admin table is the only surface that can delete a value, so it must not
  // be served a cached listing whose counts predate someone else's write.
  it("does not hold the admin listing stale", () => {
    expect(customVocabularyQueryOptions(stubClient()).staleTime).toBeUndefined();
  });

  it("passes the query's signal through", async () => {
    const getCustomVocabulary = vi.fn().mockResolvedValue({ tags: [], units: [] });
    const options = customVocabularyQueryOptions(stubClient({ getCustomVocabulary }));
    const signal = new AbortController().signal;

    await options.queryFn?.({ signal } as Parameters<NonNullable<typeof options.queryFn>>[0]);
    expect(getCustomVocabulary).toHaveBeenCalledWith(signal);
  });
});
