import { useLingui } from "@lingui/react/macro";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  type RegisteredRouter,
  type RouteIds,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RiCloseLine, RiRefreshLine } from "react-icons/ri";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { reloadPage } from "#/lib/page-reload";
import { cn } from "#/lib/utils";
import {
  evaluateLiveBuild,
  liveBuildInfoQueryOptions,
  useAppUpdateStatus,
} from "../live-build-info";

/**
 * Flows a reload would break that the mutation count does not cover, because
 * their async work runs in local state or effects: onboarding generates,
 * encrypts and persists keys and tracks the relayed deployment; send holds its
 * draft through confirmation; swap refetches its quote before the transfer
 * mutation; the create wizards confirm a symbol before deploying. Receipts keep
 * their tracking IDs in the URL and survive a reload.
 */
const RELOAD_UNSAFE_ROUTES: ReadonlySet<RouteIds<RegisteredRouter["routeTree"]>> = new Set([
  "/onboarding",
  "/wallet/send/amount",
  "/pools/$poolAddress/swap/",
  "/pools/create/$step",
  "/vouchers/create/$step",
]);

/**
 * Offers the deployment this origin now serves, and reloads into it on click.
 *
 * `suppressed` carries the root's paper-wallet import and switch, which can
 * open over any route. The banner is hidden on the flows above and while
 * suppressed; a pending mutation only disables the action.
 */
export function AppUpdateBanner({ suppressed }: { suppressed: boolean }) {
  const { t } = useLingui();
  const status = useAppUpdateStatus();
  const queryClient = useQueryClient();
  const router = useRouter();
  const onUnsafeRoute = useRouterState({
    select: (state) => state.matches.some((match) => RELOAD_UNSAFE_ROUTES.has(match.routeId)),
  });
  const mutating = useIsMutating() > 0;
  const [dismissedBuildId, setDismissedBuildId] = useState<string>();
  const [checking, setChecking] = useState(false);

  // The click awaits a fetch, after which this render's props may be stale.
  const suppressedRef = useRef(suppressed);
  useEffect(() => {
    suppressedRef.current = suppressed;
  }, [suppressed]);

  const visible =
    status.kind !== "current" &&
    !suppressed &&
    !onUnsafeRoute &&
    !(status.kind === "available" && dismissedBuildId === status.target.buildId);

  async function handleUpdate() {
    setChecking(true);
    try {
      // Confirm against the descriptor as it is now, not as it was when the
      // banner appeared: it may have rolled back. The fetch also refreshes the
      // cache, so a target that is no longer different hides the banner.
      const live = await queryClient.fetchQuery({ ...liveBuildInfoQueryOptions, staleTime: 0 });
      if (evaluateLiveBuild(live).kind === "current") return;
    } catch {
      toast.error(t`Couldn’t reach the update. Check your connection and try again.`);
      return;
    } finally {
      setChecking(false);
    }

    const unsafe =
      suppressedRef.current ||
      queryClient.isMutating() > 0 ||
      router.state.matches.some((match) => RELOAD_UNSAFE_ROUTES.has(match.routeId));
    if (unsafe) return;
    reloadPage();
  }

  // Floats over the top of the screen, where toasts appear, rather than taking
  // a place in the flow: most screens are a full `100svh` column with their
  // primary action pinned to the bottom, and a bar above them would push that
  // action — or the map's whole lower edge — below the fold. Under dialogs and
  // sheets (z-40), above page chrome such as the map's menu (z-30). The live
  // region stays mounted so its content appearing is announced.
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[35]"
    >
      {visible ? (
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-3 border border-border border-s-2 bg-card py-2 ps-3.5 pe-2",
            status.kind === "required" ? "border-s-[oklch(0.74_0.16_80)]" : "border-s-primary",
          )}
        >
          <RiRefreshLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight">
              {status.kind === "required" ? t`Update required` : t`A new version is available`}
            </p>
            {status.kind === "required" ? (
              <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                {t`This version is no longer supported.`}
              </p>
            ) : null}
          </div>
          <Button tap disabled={mutating} pending={checking} onClick={() => void handleUpdate()}>
            {checking ? t`Updating…` : t`Update`}
          </Button>
          {status.kind === "available" ? (
            <Button
              variant="ghost"
              size="icon"
              tap
              aria-label={t`Dismiss`}
              onClick={() => setDismissedBuildId(status.target.buildId)}
            >
              <RiCloseLine className="size-5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
