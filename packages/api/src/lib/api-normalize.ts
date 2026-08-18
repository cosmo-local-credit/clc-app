/**
 * Shared normalization for `clc-core` catalog responses.
 *
 * The backend returns loosely typed JSON (numeric IDs as strings, nullable
 * text, absent arrays). Every API client normalizes through these helpers so
 * cursor query formatting, address validation, and fallback behavior stay
 * identical across features.
 */

import type { HexAddress } from "@clc/core/features/catalog/logic";

export type { HexAddress };

export type CursorParams = {
  perPage: number;
  cursor?: number;
  next?: boolean;
};

export function formatCursorQuery(params: CursorParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}

export function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeNumericText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return normalizeText(value);
}

/**
 * A raw on-chain integer, as clc-core sends it: PostgreSQL NUMERIC cast to text.
 *
 * `formatTokenAmount` in @clc/core throws on anything but a non-negative integer
 * string, so a value that arrives with a scale (`"1000.000000"` from a column
 * that gained one) would take down the row that renders it. A trailing run of
 * zeros after the point is dropped as the notation it is; anything else is
 * reported as no amount, which a caller shows as unavailable rather than as a
 * number it cannot trust.
 */
export function normalizeRawAmount(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.0*)?$/.exec(value.trim());
  return match ? match[1] : null;
}

export function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeChainId(value: unknown): number | null {
  const chainId = normalizeNumber(value);
  return chainId !== null && Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export function normalizeID(value: unknown): string | null {
  return typeof value === "number" || (typeof value === "string" && value.length > 0)
    ? String(value)
    : null;
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

/** Preserves the checksummed casing the backend stored; only validates shape. */
export function normalizeHex(value: unknown): HexAddress | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as HexAddress)
    : null;
}

export function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
