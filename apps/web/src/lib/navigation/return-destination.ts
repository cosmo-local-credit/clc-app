import { PREFILL_URL_MAX_BYTES, utf8ByteLength } from "@clc/core/lib/prefill";

import { sanitizeInternalRedirect } from "#/components/auth/redirect";

type LocationParts = { pathname: string; searchStr: string; hash: string };

/**
 * This URL as an internal destination: `pathname + searchStr + hash`, normalized
 * by `sanitizeInternalRedirect` (which percent-encodes raw non-ASCII). The
 * router keeps `hash` without its `#`.
 *
 * The one string both the prefill byte budget and the onboarding redirect
 * measure, so the two cannot drift.
 */
export function locationDestination({ pathname, searchStr, hash }: LocationParts) {
  return sanitizeInternalRedirect(`${pathname}${searchStr}${hash ? `#${hash}` : ""}`);
}

/** Whether this URL fits the prefill budget; a link over it ignores its whole prefill. */
export function isWithinLinkBudget(location: LocationParts): boolean {
  const destination = locationDestination(location);
  return destination !== undefined && utf8ByteLength(destination) <= PREFILL_URL_MAX_BYTES;
}

/**
 * Where to return after sign-in. Over the budget the pathname alone: the
 * onboarding redirect re-encodes this as one query value, and an unbounded tail
 * would push that URL past what the edge accepts. A prefill link that long had
 * its prefill ignored already, so nothing it could have applied is lost.
 */
export function returnDestination(location: LocationParts): string | undefined {
  return isWithinLinkBudget(location)
    ? locationDestination(location)
    : sanitizeInternalRedirect(location.pathname);
}
