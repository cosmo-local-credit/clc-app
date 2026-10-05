import {
  APP_BUILD_INFO_PATH,
  type AppBuildInfo,
  type AppUpdateStatus,
  appBuildInfoSchema,
  evaluateAppUpdate,
} from "@clc/core/features/app-updates/logic";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { BUILD_INFO } from "./build-info";

/**
 * The deployment this origin serves now, read from its own static descriptor.
 *
 * Operators keep the console open for days. A reload is the whole update: there
 * is no service worker, and every navigation fetches fresh SSR HTML.
 */

const CHECK_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 15 * 60_000;
/** Visibility and reconnect checks coalesce to at most one a minute. */
const MIN_CHECK_INTERVAL_MS = 60_000;

/** A dev server publishes no descriptor and has no successor to look for. */
const UPDATES_ENABLED =
  !import.meta.env.DEV && BUILD_INFO.environment !== "development" && typeof window !== "undefined";

async function fetchLiveBuildInfo(signal: AbortSignal): Promise<AppBuildInfo> {
  const response = await fetch(APP_BUILD_INFO_PATH, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`${APP_BUILD_INFO_PATH} answered ${response.status}`);
  const parsed = appBuildInfoSchema.safeParse(await response.json());
  if (!parsed.success) {
    // Includes a floor above the deployment's own milestone, which no update
    // could satisfy. Rejected, so it cannot start a banner or a reload loop.
    console.warn("[app-updates] ignoring an invalid build descriptor", parsed.error.issues);
    throw new Error(`${APP_BUILD_INFO_PATH} is not a valid build descriptor`);
  }
  return parsed.data;
}

export const liveBuildInfoQueryOptions = queryOptions({
  queryKey: ["app-updates", "live-build-info"],
  queryFn: ({ signal }) => fetchLiveBuildInfo(signal),
  enabled: UPDATES_ENABLED,
  staleTime: MIN_CHECK_INTERVAL_MS,
  refetchInterval: POLL_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  // A failed check keeps the last good answer and waits for the next trigger.
  retry: false,
  // Fail offline rather than pause. A paused fetch holds an "Update" click
  // open and reloads the page whenever the connection returns, long after
  // the user may have moved on.
  networkMode: "always",
});

/** Minimums are not enforced on `*.pages.dev` previews, which only advise. */
export function evaluateLiveBuild(live: AppBuildInfo): AppUpdateStatus {
  return evaluateAppUpdate(BUILD_INFO, live, {
    enforceMinimum: !window.location.hostname.endsWith(".pages.dev"),
  });
}

export function useAppUpdateStatus(): AppUpdateStatus {
  const { data } = useQuery(liveBuildInfoQueryOptions);
  return data ? evaluateLiveBuild(data) : { kind: "current" };
}
