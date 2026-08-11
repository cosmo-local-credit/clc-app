/**
 * Resolves a query's observable state into the cases a surface must render
 * distinctly.
 *
 * An operations console must never let a failure read as valid data. The trap is
 * `query.data?.items ?? []`, which turns a failed request into a convincing
 * empty list, and `data?.count ?? 0`, which turns it into a convincing zero.
 * Routing every surface through this function makes that mistake structural
 * rather than a matter of remembering.
 *
 * `stale` is deliberately distinct from `error`: a refresh that fails while
 * previous data is still cached should keep showing that data with a warning,
 * not replace a populated screen with an error block.
 */

export type DataState =
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "stale"; message: string }
  | { kind: "empty" }
  | { kind: "ready" };

export type QueryLike = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** Whether the cache currently holds a result, successful or stale. */
  hasData: boolean;
};

const FALLBACK_MESSAGE = "Request failed.";

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return FALLBACK_MESSAGE;
}

export function resolveDataState(query: QueryLike, isEmpty: boolean): DataState {
  // Order matters. A failure with cached data is `stale`, not `error`, and both
  // must be checked before `empty` so a failed request never reads as "no rows".
  if (query.isError) {
    return query.hasData
      ? { kind: "stale", message: errorMessage(query.error) }
      : { kind: "error", message: errorMessage(query.error) };
  }
  if (query.isPending || !query.hasData) return { kind: "pending" };
  return isEmpty ? { kind: "empty" } : { kind: "ready" };
}

/**
 * Whether a figure derived from this query can be shown at all. A metric with no
 * usable data must render as unavailable rather than zero.
 */
export function isFigureAvailable(state: DataState): boolean {
  return state.kind === "ready" || state.kind === "empty" || state.kind === "stale";
}
