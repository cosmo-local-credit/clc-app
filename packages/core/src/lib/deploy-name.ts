/**
 * Normalization for voucher and pool display names.
 *
 * A name is unique across the catalog, so the client and the backend have to
 * agree on when two of them are the same. The backend folds a name with
 * `lower(regexp_replace(btrim(x), '\s+', ' ', 'g'))`; these are its counterpart,
 * so a name this module calls free is the one the deploy will accept.
 */

/** Trimmed, with runs of inner whitespace collapsed to one space. */
export function normalizeDeployName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * The form two names are compared in. Case folds away as well, so it is a cache
 * key rather than anything to show the user — `normalizeDeployName` is what a
 * field should hold.
 */
export function deployNameKey(value: string): string {
  return normalizeDeployName(value).toLowerCase();
}
