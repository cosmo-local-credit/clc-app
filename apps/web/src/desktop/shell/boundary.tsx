import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useLayout } from "#/desktop/layout";
import { DesktopShell } from "#/desktop/shell/desktop-shell";

const BARE = new Set(["/onboarding"]);

/** The shell wraps every desktop route except onboarding, which owns the viewport. */
export function DesktopBoundary({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (layout !== "desktop" || BARE.has(pathname)) return children;
  return <DesktopShell>{children}</DesktopShell>;
}
