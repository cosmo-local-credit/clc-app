import {
  DEFAULT_POST_TIMING,
  type PostTiming,
  parsePostTiming,
} from "@clc/core/features/reports/logic";

export type PostTimingSearch = {
  timing?: PostTiming;
  /** Legacy creation-age parameter retained only for canonical redirects. */
  posted?: string;
};

export function pickPostTimingSearch(search: unknown): { timing?: string; posted?: string } {
  if (typeof search !== "object" || search === null) return {};
  const source = search as Record<string, unknown>;
  return {
    ...pickScalar(source.timing, "timing"),
    ...pickScalar(source.posted, "posted"),
  };
}

export function parsePostTimingSearch(search: unknown): PostTiming {
  const picked = pickPostTimingSearch(search);
  if (picked.timing !== undefined) return parsePostTiming(picked.timing);
  return picked.posted === "all" ? "all" : DEFAULT_POST_TIMING;
}

export function canonicalPostTimingSearch(search: unknown): PostTimingSearch | null {
  const picked = pickPostTimingSearch(search);
  if (picked.timing === undefined && picked.posted === undefined) return null;
  const timing = parsePostTimingSearch(search);
  if (picked.posted === undefined && picked.timing === timing && timing !== DEFAULT_POST_TIMING) {
    return null;
  }
  return {
    timing: timing === DEFAULT_POST_TIMING ? undefined : timing,
    posted: undefined,
  };
}

function pickScalar(value: unknown, key: "timing" | "posted"): Partial<Record<typeof key, string>> {
  if (typeof value === "string") return { [key]: value };
  if (Array.isArray(value) && typeof value[0] === "string") return { [key]: value[0] };
  return {};
}
