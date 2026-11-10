import type { z } from "zod";

import { type LocationInput, locationSchema } from "../features/location/logic";
import { toVocabularyTitleCase, validateCustomTag } from "../features/vocabulary/logic";

/**
 * Shared rules for the v1 creation-prefill links (`?v=1&name=…`).
 *
 * A link seeds a create form; it never advances, signs or publishes. Each field
 * is validated on its own by the schema its form uses, and an invalid field
 * drops itself while the rest of the link still applies.
 *
 * The router's default search parser JSON-parses every value before
 * `validateSearch` sees it, which is lossy for a number-looking string
 * (`supply=9007199254740993.000001` becomes `9007199254740994`). A string field
 * therefore accepts only a string: the link quotes such a value
 * (`price=%2250%22`), and a bare number, boolean or null drops the field rather
 * than apply digits it may already have lost.
 */

export const PREFILL_VERSION = 1;

/**
 * The longest link a prefill may arrive on, in encoded bytes of
 * `pathname + searchStr + hash`. The onboarding redirect re-encodes the link as
 * one query value, which at worst triples it: 12 KiB plus origin and prefix
 * stays under Cloudflare's 16 KiB URL limit.
 */
export const PREFILL_URL_MAX_BYTES = 4096;

/** More tags than this drops the whole `tags` field. */
export const PREFILL_TAGS_MAX = 12;

/** A param as the router hands it to `validateSearch`, and as it is handed back. */
export type PrefillWireValue = string | number | boolean;

export type PrefillWire = Record<string, PrefillWireValue>;

/**
 * What `validateSearch` returns (`search`, each accepted param in its wire form,
 * so the router's rewrite leaves the link as it arrived) and what the form seeds
 * from (`values`).
 */
export type ParsedPrefill<V, S = PrefillWire> = { search: S; values: V };

const LOCATION_KEYS = ["locationName", "lat", "lng", "country"] as const;

const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

/** `v=1` and `v="1"` both say version 1; anything else ignores the prefill. */
export function hasPrefillVersion(search: Record<string, unknown>): boolean {
  return search.v === PREFILL_VERSION || search.v === String(PREFILL_VERSION);
}

/** Accepts a value only when the schema does, returning its parsed output. */
export function bySchema<T>(schema: z.ZodType<T>): (value: string) => T | undefined {
  return (value) => {
    const result = schema.safeParse(value);
    return result.success ? result.data : undefined;
  };
}

/**
 * Reads params off a parsed search, recording each accepted one in its wire
 * form. One reader per parse; `wire` is complete once every field was read.
 */
export function createPrefillReader(search: Record<string, unknown>) {
  const wire: PrefillWire = { v: search.v as PrefillWireValue };

  return {
    wire,

    /** A string field. Empty text counts as absent, so it never blocks another seed. */
    text<T>(key: string, parse: (value: string) => T | undefined): T | undefined {
      const raw = search[key];
      if (typeof raw !== "string" || raw.trim() === "") return undefined;
      const value = parse(raw);
      if (value === undefined) return undefined;
      wire[key] = raw;
      return value;
    },

    /** `true` / `false`, bare or quoted. */
    boolean(key: string): boolean | undefined {
      const raw = search[key];
      const value =
        raw === true || raw === "true"
          ? true
          : raw === false || raw === "false"
            ? false
            : undefined;
      if (value !== undefined) wire[key] = raw as PrefillWireValue;
      return value;
    },

    /** All four of `locationName`, `lat`, `lng`, `country`, or nothing. */
    location(): LocationInput | undefined {
      const lat = toCoordinate(search.lat);
      const lng = toCoordinate(search.lng);
      const { locationName, country } = search;
      if (lat === undefined || lng === undefined) return undefined;
      if (typeof locationName !== "string" || typeof country !== "string") return undefined;
      const result = locationSchema.safeParse({
        lat,
        lng,
        locationName,
        country: country.trim().toUpperCase(),
      });
      if (!result.success) return undefined;
      for (const key of LOCATION_KEYS) wire[key] = search[key] as PrefillWireValue;
      return result.data;
    },
  };
}

/** A coordinate as a number, or a plain decimal string; nothing is lost either way. */
function toCoordinate(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string" || !/^-?\d+(\.\d+)?$/.test(raw.trim())) return undefined;
  return Number(raw);
}

/**
 * Comma separated, trimmed, empties and case-insensitive duplicates dropped,
 * each title-cased the way the tag input does. An invalid tag or more than
 * `PREFILL_TAGS_MAX` drops the field.
 */
export function parsePrefillTags(raw: string): string[] | undefined {
  const tags: string[] = [];
  for (const part of raw.split(",")) {
    const tag = toVocabularyTitleCase(part);
    if (tag === "") continue;
    if (validateCustomTag(tag)) return undefined;
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  if (tags.length === 0 || tags.length > PREFILL_TAGS_MAX) return undefined;
  return tags;
}

/**
 * An image source storage-server may fetch. Only https: the service refuses
 * anything else, so a link carrying http would only ever fail the import.
 */
export function parsePrefillImageSource(raw: string): string | undefined {
  const value = raw.trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Upper-cases first, then validates, like the symbol input does. */
export function upperCased<T>(parse: (value: string) => T | undefined) {
  return (value: string) => parse(value.toUpperCase());
}

/** The fields a link may carry before encoding. Location is flattened by the builder. */
export type PrefillHrefFields = Record<
  string,
  string | number | boolean | readonly string[] | LocationInput | undefined
>;

/** Whether the router's parser would turn this text into something other than itself. */
function jsonParses(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The router's `stringifySearch` rule, reimplemented because core cannot import
 * the router: a string `JSON.parse` would accept is JSON-quoted, numbers and
 * booleans are written bare, and `URLSearchParams` form-encodes the result.
 * `apps/web` checks it against the router's `defaultParseSearch`.
 */
export function encodePrefillSearch(fields: PrefillHrefFields): string {
  const params = new URLSearchParams();
  params.set("v", String(PREFILL_VERSION));
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      params.set(key, quoted(value));
    } else if (typeof value === "number" || typeof value === "boolean") {
      params.set(key, String(value));
    } else if (Array.isArray(value)) {
      params.set(key, quoted(value.join(",")));
    } else if (value !== undefined) {
      // The only object field: location, flattened into its four params.
      const location = value as LocationInput;
      params.set("locationName", quoted(location.locationName));
      params.set("lat", String(location.lat));
      params.set("lng", String(location.lng));
      params.set("country", quoted(location.country));
    }
  }
  return params.toString();
}

function quoted(value: string): string {
  return jsonParses(value) ? JSON.stringify(value) : value;
}

export class PrefillTooLongError extends Error {
  constructor(readonly bytes: number) {
    super(`Prefill link is ${bytes} bytes; the limit is ${PREFILL_URL_MAX_BYTES}`);
    this.name = "PrefillTooLongError";
  }
}

/** Builds `pathname?search` and throws when it is over the byte budget. */
export function buildPrefillHref(pathname: string, fields: PrefillHrefFields): string {
  const href = `${pathname}?${encodePrefillSearch(fields)}`;
  const bytes = utf8ByteLength(href);
  if (bytes > PREFILL_URL_MAX_BYTES) throw new PrefillTooLongError(bytes);
  return href;
}

/** Drops keys whose value is `undefined`, so a parsed prefill lists only what the link set. */
export function definedFields<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
