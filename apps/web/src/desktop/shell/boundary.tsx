import { lazy, type ReactNode, Suspense } from "react";
import { useRouterState } from "@tanstack/react-router";

import { readLayout, useLayout } from "#/desktop/layout";
import { isRecoverySession } from "#/features/account-retirement/logic/lifecycle";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

const BARE = new Set(["/onboarding"]);

// The shell (sidebar, top bar, palette, shortcuts) is the desktop's own chunk,
// so a phone never downloads it. This module is in the root chunk, so a
// desktop document starts fetching the shell while the app is still booting,
// long before hydration swaps the layout in; a live switch from the phone
// fetches it then.
const loadShell = () => import("#/desktop/shell/desktop-shell");
const DesktopShell = lazy(() => loadShell().then((module) => ({ default: module.DesktopShell })));
if (readLayout() === "desktop") void loadShell();

/**
 * The shell wraps every desktop route except onboarding, which owns the
 * viewport, and a retiring account's recovery screens: the sidebar and palette
 * lead to the marketplace and creation flows that account no longer has.
 */
export function DesktopBoundary({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const recovering = isRecoverySession(useAuthStatus());
  if (layout !== "desktop" || BARE.has(pathname) || recovering) return children;
  // Nothing of the route renders until the shell can hold it: mounting it
  // outside and then moving it in would mount it twice, and a view draft is
  // claimed by the first mount and dropped by its unmount.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DesktopShell>{children}</DesktopShell>
    </Suspense>
  );
}
