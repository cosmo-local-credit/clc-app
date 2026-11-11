import { type PostedWithin, parsePostedWithin } from "@clc/core/features/reports/logic";

export function pickPostedSearch(search: unknown): { posted?: string } {
  if (typeof search !== "object" || search === null) return {};
  const value = (search as Record<string, unknown>).posted;
  if (typeof value === "string") return { posted: value };
  if (Array.isArray(value) && typeof value[0] === "string") return { posted: value[0] };
  return {};
}

export function parsePostedSearch(search: unknown): PostedWithin {
  return parsePostedWithin(pickPostedSearch(search).posted);
}

/** Keep explicit windows so a saved preference cannot override a shared link. */
export function canonicalPostedSearch(search: unknown): { posted?: PostedWithin } | null {
  const raw = pickPostedSearch(search).posted;
  if (raw === undefined) return null;
  const canonical = parsePostedWithin(raw);
  if (raw === canonical) return null;
  return { posted: canonical };
}
