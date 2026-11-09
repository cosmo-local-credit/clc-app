import { lazy, type ReactNode, Suspense } from "react";
import { useRouterState } from "@tanstack/react-router";

import { readLayout, useLayout } from "#/desktop/layout";

const BARE = new Set(["/onboarding"]);

// The shell (sidebar, top bar, palette, shortcuts) is the desktop's own chunk,
// so a phone never downloads it. This module is in the root chunk, so a
// desktop document starts fetching the shell while the app is still booting,
// long before hydration swaps the layout in; a live switch from the phone
// fetches it then.
const loadShell = () => import("#/desktop/shell/desktop-shell");
const DesktopShell = lazy(() => loadShell().then((module) => ({ default: module.DesktopShell })));
if (readLayout() === "desktop") void loadShell();

/** The shell wraps every desktop route except onboarding, which owns the viewport. */
export function DesktopBoundary({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (layout !== "desktop" || BARE.has(pathname)) return children;
  // Nothing of the route renders until the shell can hold it: mounting it
  // outside and then moving it in would mount it twice, and a view draft is
  // claimed by the first mount and dropped by its unmount.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DesktopShell>{children}</DesktopShell>
    </Suspense>
  );
}
