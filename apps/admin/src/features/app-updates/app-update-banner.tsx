import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { FiRefreshCw, FiX } from "react-icons/fi";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { FileRoutesById } from "#/routeTree.gen";
import {
  evaluateLiveBuild,
  liveBuildInfoQueryOptions,
  useAppUpdateStatus,
} from "./live-build-info";

/**
 * Screens whose work a reload would destroy outside any mutation. Paper wallet
 * keys exist only in the tab, from generation through encryption and
 * registration until the sheet is downloaded — a reload mid-batch can leave
 * accounts registered whose keys nobody holds. Pool and voucher publishing
 * track the deployment with queries after the deploy mutation settles. The post
 * editor keeps its draft in form state.
 */
const RELOAD_UNSAFE_ROUTES: ReadonlySet<string> = new Set([
  "/_shell/paper-wallets",
  "/_shell/nfc-cards",
  "/_shell/pools/publish",
  "/_shell/vouchers/publish",
  "/_shell/posts/new",
  "/_shell/posts/$reportId/edit",
] satisfies (keyof FileRoutesById)[]);

function onReloadUnsafeRoute(matches: readonly { routeId: string }[]): boolean {
  return matches.some((match) => RELOAD_UNSAFE_ROUTES.has(match.routeId));
}

/**
 * Offers the deployment this origin now serves, and reloads into it on click.
 *
 * Mounted above the auth boundary, so it reaches the sign-in panel too. Hidden
 * on the screens above; a pending mutation — sign-in, paper-wallet decryption,
 * a relayed batch — disables the action.
 */
export function AppUpdateBanner() {
  const status = useAppUpdateStatus();
  const queryClient = useQueryClient();
  const router = useRouter();
  const onUnsafeRoute = useRouterState({ select: (state) => onReloadUnsafeRoute(state.matches) });
  const mutating = useIsMutating() > 0;
  const [dismissedBuildId, setDismissedBuildId] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const visible =
    status.kind !== "current" &&
    !onUnsafeRoute &&
    !(status.kind === "available" && dismissedBuildId === status.target.buildId);

  async function handleUpdate() {
    setChecking(true);
    setFailed(false);
    try {
      // Confirm against the descriptor as it is now: it may have rolled back.
      // The fetch refreshes the cache, so a no-longer-different target hides
      // the banner on its own.
      const live = await queryClient.fetchQuery({ ...liveBuildInfoQueryOptions, staleTime: 0 });
      if (evaluateLiveBuild(live).kind === "current") return;
    } catch {
      setFailed(true);
      return;
    } finally {
      setChecking(false);
    }
    // Re-read after the fetch: the operator may have started work meanwhile.
    if (queryClient.isMutating() > 0 || onReloadUnsafeRoute(router.state.matches)) return;
    window.location.reload();
  }

  // A floating card in the corner opposite the toasts (top right). A bar in the
  // flow would slide under the fixed, full-height sidebar. Under sheets and
  // menus (z-50). The live region stays mounted so its content appearing is
  // announced.
  return (
    <div
      role="status"
      className="pointer-events-none fixed right-4 bottom-4 z-40 w-[26rem] max-w-[calc(100vw-2rem)]"
    >
      {visible ? (
        <div
          className={cn(
            "border-border bg-card pointer-events-auto flex items-start gap-3 border border-l-2 p-3 text-sm",
            status.kind === "required" ? "border-l-amber-500" : "border-l-primary",
          )}
        >
          <FiRefreshCw
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {status.kind === "required" ? "Update required." : "A new version is available."}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {failed
                ? "Could not reach the update. Check the connection and try again."
                : status.kind === "required"
                  ? "This version of the console is no longer supported."
                  : "Reload to use it."}
            </p>
            <Button
              size="sm"
              className="mt-2"
              disabled={checking || mutating}
              onClick={() => void handleUpdate()}
            >
              {checking ? "Updating..." : "Update"}
            </Button>
          </div>
          {status.kind === "available" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={() => setDismissedBuildId(status.target.buildId)}
            >
              <FiX aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
