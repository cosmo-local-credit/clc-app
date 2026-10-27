import type { ReactNode } from "react";

import { OnboardingMenu } from "#/components/language-selector";
import { cn } from "#/lib/utils";

/**
 * The desktop footer row. Notes go to the start; the Back link (the screen's
 * `start`) is drawn as an outline button beside the actions at the end.
 */
const EMBEDDED_FOOTER = cn(
  "flex shrink-0 flex-wrap items-center justify-end gap-2 border-border border-t pt-4 *:w-auto",
  "[&>p]:order-first [&>p]:me-auto [&>p]:text-start",
  "[&>p_a]:font-semibold [&>p_a]:text-primary [&>p_a]:no-underline [&>p_a]:hover:underline",
  "[&>a:first-child]:ms-0 [&>a:first-child]:h-9 [&>a:first-child]:border [&>a:first-child]:border-foreground/25",
  "[&>a:first-child]:bg-card [&>a:first-child]:px-3.5 [&>a:first-child]:font-semibold",
  "[&>a:first-child]:text-foreground [&>a:first-child]:text-xs",
);

/**
 * The frame every onboarding screen shares: one top bar (Back or the logo at
 * the start, language and theme at the end), a body that holds the screen's
 * one job, and the actions pinned under it.
 *
 * The frame is exactly one dynamic viewport tall (less the bottom navigation
 * where a gate sits under it), so the primary action stays on screen with the
 * browser's toolbars showing. Only the body scrolls, and only when a phone is
 * too short for it.
 */
export function OnboardingScreen({
  start,
  menu = true,
  footer,
  className,
  embedded = false,
  children,
}: {
  start?: ReactNode;
  /** Language and theme. Off where the screen is not part of signing in. */
  menu?: boolean;
  footer?: ReactNode;
  className?: string;
  /** Drop the phone frame so a desktop column can hold the same body. */
  embedded?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col gap-5", className)}>
        {children}
        {footer ? (
          <div className={EMBEDDED_FOOTER}>
            {start}
            {footer}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex h-[calc(100dvh-var(--bottom-nav-offset))] flex-col bg-background">
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 px-6 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="flex min-w-0 items-center">{start}</div>
        {menu ? <OnboardingMenu /> : null}
      </header>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pt-3 pb-4",
          className,
        )}
      >
        {children}
      </div>
      {footer ? (
        <footer className="flex shrink-0 flex-col gap-3 px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/** The locked page title, shared by every onboarding screen. */
export function OnboardingTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="min-w-0 break-words font-heading text-[1.75rem] font-bold leading-tight">
      {children}
    </h1>
  );
}
