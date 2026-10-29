import { type ReactNode, Suspense } from "react";

import { useLayout } from "#/desktop/layout";
import { DeskLoading } from "#/desktop/shell/desk-loading";

/**
 * Picks the view after hydration. The desktop node is a lazy element created
 * at module scope; it stays unloaded while the phone renders `mobile`.
 */
export function LayoutSwitch({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  const layout = useLayout();
  if (layout !== "desktop") return mobile;
  return <Suspense fallback={<DeskLoading />}>{desktop}</Suspense>;
}
