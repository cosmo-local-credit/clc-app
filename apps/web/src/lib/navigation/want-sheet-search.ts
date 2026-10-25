export type WantSheetSearch = { want?: string };

export function parseWantId(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value) || value === "0") return undefined;
  return value;
}

export function parseWantSheetSearch(search: Record<string, unknown>): WantSheetSearch {
  return { want: parseWantId(search.want) };
}
