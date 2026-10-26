import type { ActivityKind } from "@clc/api/features/accounts/client";

export const ACTIVITY_KIND_ORDER = ["creation", "sent", "received", "swapped"] as const;

export type ActivityRouteSearch = {
  activityQ?: string | readonly string[];
  activityTypes?: string | readonly string[];
  /** Selected activity row. Opening it pushes history so Back closes the inspector. */
  tx?: string;
};

export type ActivitySearch = {
  q: string;
  types: readonly ActivityKind[];
};

export function pickActivitySearch(search: unknown): ActivityRouteSearch {
  if (typeof search !== "object" || search === null) return {};
  const record = search as Record<string, unknown>;
  const activityQ = pickStringSearchValue(record.activityQ);
  const activityTypes = pickStringSearchValue(record.activityTypes);
  const tx = typeof record.tx === "string" && record.tx.length > 0 ? record.tx : undefined;
  return {
    ...(activityQ !== undefined ? { activityQ } : {}),
    ...(activityTypes !== undefined ? { activityTypes } : {}),
    ...(tx !== undefined ? { tx } : {}),
  };
}

export function parseActivitySearch(search: unknown): ActivitySearch {
  const raw = pickActivitySearch(search);
  const rawQueries = toValues(raw.activityQ);
  const q = (rawQueries.find((value) => value.trim() !== "") ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 66);
  const selected = new Set<ActivityKind>();
  for (const value of toValues(raw.activityTypes)) {
    for (const part of value.split(",")) {
      const kind = part.trim().toLowerCase();
      if ((ACTIVITY_KIND_ORDER as readonly string[]).includes(kind)) {
        selected.add(kind as ActivityKind);
      }
    }
  }
  return { q, types: ACTIVITY_KIND_ORDER.filter((kind) => selected.has(kind)) };
}

export function canonicalActivityRouteSearch(search: unknown): ActivityRouteSearch | null {
  const raw = pickActivitySearch(search);
  const parsed = parseActivitySearch(raw);
  const canonical: ActivityRouteSearch = {
    activityQ: parsed.q || undefined,
    activityTypes: parsed.types.length ? parsed.types.join(",") : undefined,
  };
  if (raw.activityQ === canonical.activityQ && raw.activityTypes === canonical.activityTypes) {
    return null;
  }
  return canonical;
}

export function clearActivityRouteSearch(): ActivityRouteSearch {
  return { activityQ: undefined, activityTypes: undefined, tx: undefined };
}

function pickStringSearchValue(value: unknown): string | readonly string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string")) {
    return value;
  }
  return value === undefined ? undefined : ["__invalid__"];
}

function toValues(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
