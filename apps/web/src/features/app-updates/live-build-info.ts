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
 * An installed PWA resumes without navigating and keeps running the code it
 * last loaded, so the page asks. An ordinary reload is the whole update: the
 * worker precaches only hashed assets and never serves documents, so the fresh
 * SSR HTML references the new build's assets without waiting for a worker.
 * Revisit that if document or runtime caching is ever added to `sw.ts`.
 */

const CHECK_TIMEOUT_MS = 10_000;

/** Polling cadence while visible. TanStack pauses the interval while hidden. */
const POLL_INTERVAL_MS = 15 * 60_000;

/** Visibility and reconnect checks coalesce to at most one a minute. */
const MIN_CHECK_INTERVAL_MS = 60_000;

/** A dev server publishes no descriptor and has no successor to look for. */
const UPDATES_ENABLED =
  !import.meta.env.DEV && BUILD_INFO.environment !== "development" && typeof window !== "undefined";

async function fetchLiveBuildInfo(signal: AbortSignal): Promise<AppBuildInfo> {
  // Wired by hand: combining signals with `AbortSignal.any` needs iOS 17.4,
  // and installed PWAs on older iPhones still run this.
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    // `no-store` keeps both the HTTP cache and any intermediary out of it; the
    // worker does not intercept it because the precache never lists it.
    const response = await fetch(APP_BUILD_INFO_PATH, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export const liveBuildInfoQueryOptions = queryOptions({
  queryKey: ["app-updates", "live-build-info"],
  queryFn: ({ signal }) => fetchLiveBuildInfo(signal),
  enabled: UPDATES_ENABLED,
  staleTime: MIN_CHECK_INTERVAL_MS,
  refetchInterval: POLL_INTERVAL_MS,
  refetchIntervalInBackground: false,
  // Resume is a visibility change, which is what TanStack's focus manager
  // listens for; the global default turns it off.
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  // A failed check keeps the last good answer and waits for the next trigger.
  retry: false,
  // Fail offline rather than pause. A paused fetch holds an "Update" click
  // open and reloads the page whenever the connection returns, long after
  // the user may have moved on.
  networkMode: "always",
});

/**
 * What this page should tell its user. Minimums are not enforced on
 * `*.pages.dev` previews: a preview may offer its own newer build, but nothing
 * there is a supported release that users must move off.
 */
export function evaluateLiveBuild(live: AppBuildInfo): AppUpdateStatus {
  return evaluateAppUpdate(BUILD_INFO, live, {
    enforceMinimum: !window.location.hostname.endsWith(".pages.dev"),
  });
}

export function useAppUpdateStatus(): AppUpdateStatus {
  const { data } = useQuery(liveBuildInfoQueryOptions);
  return data ? evaluateLiveBuild(data) : { kind: "current" };
}
