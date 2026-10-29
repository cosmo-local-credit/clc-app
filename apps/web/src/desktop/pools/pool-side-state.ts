import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import type { PoolSide } from "#/desktop/pools/detail/pool-side-panel";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /**
     * On the entry that opening a pool panel pushed. Only that entry may be
     * popped to close the panel: the entry behind a deep link can be anything,
     * another site included.
     */
    poolSide?: true;
  }
}

type PoolTool =
  | "details"
  | "liquidity"
  | "fees"
  | "feeSettings"
  | "ownership"
  | "retirement"
  | "approve";

/** What the URL asks the side column to show, before it is matched to loaded data. */
export type PoolSideRequest =
  | { kind: "tool"; tool: PoolTool }
  | { kind: "voucher"; address: string }
  | { kind: "activity"; key: string };

/**
 * The search params a pool panel lives in. `voucher` is taken: the pool route
 * redirects it to the voucher's own page, so a managed voucher is `manage`.
 */
const TOOL = "tool";
const MANAGE = "manage";
const ENTRY = "entry";

const TOOL_VALUES: Record<string, PoolTool> = {
  details: "details",
  liquidity: "liquidity",
  fees: "fees",
  "fee-settings": "feeSettings",
  ownership: "ownership",
  retirement: "retirement",
  approve: "approve",
};

const TOOL_PARAM: Record<PoolTool, string> = {
  details: "details",
  liquidity: "liquidity",
  fees: "fees",
  feeSettings: "fee-settings",
  ownership: "ownership",
  retirement: "retirement",
  approve: "approve",
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The panel a pool URL asks for. A voucher or an activity row wins over a tool. */
export function parsePoolSideRequest(search: unknown): PoolSideRequest | null {
  const params = (typeof search === "object" && search !== null ? search : {}) as Record<
    string,
    unknown
  >;
  const entry = text(params[ENTRY]);
  if (entry) return { kind: "activity", key: entry };
  const manage = text(params[MANAGE]);
  if (manage) return { kind: "voucher", address: manage.toLowerCase() };
  const tool = text(params[TOOL]);
  const known = tool ? TOOL_VALUES[tool] : undefined;
  return known ? { kind: "tool", tool: known } : null;
}

/** The URL's panel params for one request; the others are cleared. */
function poolSideSearch(request: PoolSideRequest | null) {
  return {
    [TOOL]: request?.kind === "tool" ? TOOL_PARAM[request.tool] : undefined,
    [MANAGE]: request?.kind === "voucher" ? request.address : undefined,
    [ENTRY]: request?.kind === "activity" ? request.key : undefined,
  };
}

/** The request a side the page just opened stands for. */
export function requestForSide(side: PoolSide): PoolSideRequest | null {
  switch (side.kind) {
    case "voucher":
      return { kind: "voucher", address: side.voucher.tokenAddress.toLowerCase() };
    case "activity":
      return { kind: "activity", key: side.entry.key };
    case "activityMissing":
      return null;
    default:
      return { kind: "tool", tool: side.kind };
  }
}

function requestKey(request: PoolSideRequest | null) {
  if (!request) return "";
  return request.kind === "tool"
    ? `tool:${request.tool}`
    : request.kind === "voucher"
      ? `voucher:${request.address}`
      : `activity:${request.key}`;
}

/**
 * The pool page's side panel, kept in the URL so Back, a refresh and a shared
 * link all keep it, like Activity and Cash.
 *
 * The first open pushes one history entry and marks it; opening another panel
 * while one is open replaces it and keeps the mark; Close pops the marked
 * entry. A panel reached any other way, a deep link above all, closes by
 * replacing the entry with the pool page itself, so Close never leaves it.
 */
export function usePoolSideNavigation() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const request = parsePoolSideRequest(search);
  const key = requestKey(request);

  // The URL lags the call that changes it by a render. Two opens in that gap
  // (a row's focus, then its click) must not push two entries, nor two closes
  // pop two.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [key]);

  const open = useCallback(
    (next: PoolSideRequest) => {
      const nextKey = requestKey(next);
      if (nextKey === key || nextKey === pending.current) return;
      const opened = key !== "" || pending.current !== null;
      pending.current = nextKey;
      void navigate({
        to: ".",
        search: ((previous: Record<string, unknown>) => ({
          ...previous,
          ...poolSideSearch(next),
        })) as never,
        replace: opened,
        // A replace keeps whatever mark the entry carries; a push is marked.
        state: opened ? true : { poolSide: true },
        resetScroll: false,
      });
    },
    [key, navigate],
  );

  const close = useCallback(() => {
    if (key === "" || pending.current === "") return;
    pending.current = "";
    if (router.state.location.state.poolSide) {
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        ...poolSideSearch(null),
      })) as never,
      replace: true,
      resetScroll: false,
    });
  }, [key, navigate, router]);

  return { request, open, close };
}
