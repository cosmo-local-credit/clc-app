import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { RiArticleLine, RiNotification3Line, RiSettings3Line, RiWallet3Line } from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { cn } from "#/lib/utils";
import type { HomeTab } from "./tabs";

export function BottomNavigation({
  activeTab,
  isAuthenticated = true,
}: {
  activeTab: HomeTab;
  isAuthenticated?: boolean;
}) {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Primary navigation`}
      className="fixed inset-x-0 bottom-0 z-50 border-border border-t bg-card px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <div className={isAuthenticated ? "grid h-16 grid-cols-5" : "grid h-16 grid-cols-1"}>
        {isAuthenticated ? (
          <>
            <NavLink
              tab="wallet"
              label={t`Wallet`}
              activeTab={activeTab}
              icon={<RiWallet3Line />}
            />
            <NavLink
              tab="activity"
              label={t`Activity`}
              activeTab={activeTab}
              icon={<RiNotification3Line />}
            />
          </>
        ) : null}
        <MarketNavLink label={t`Market`} activeTab={activeTab} />
        {isAuthenticated ? (
          <>
            <NavLink tab="posts" label={t`Posts`} activeTab={activeTab} icon={<RiArticleLine />} />
            <NavLink
              tab="settings"
              label={t`Settings`}
              activeTab={activeTab}
              icon={<RiSettings3Line />}
            />
          </>
        ) : null}
      </div>
    </nav>
  );
}

function NavLink({
  tab,
  label,
  activeTab,
  icon,
}: {
  tab: HomeTab;
  label: string;
  activeTab: HomeTab;
  icon: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <Link
      to="/"
      search={{ tab }}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors active:bg-muted",
        active && "text-foreground",
      )}
      onClick={(event) => preventActiveNavigation(event, active)}
    >
      <span className="flex size-6 items-center justify-center [&_svg]:size-4">{icon}</span>
      <span className={cn("font-medium text-[0.6875rem]", active && "font-semibold")}>{label}</span>
    </Link>
  );
}

function MarketNavLink({ label, activeTab }: { label: string; activeTab: HomeTab }) {
  const active = activeTab === "market";
  return (
    <Link
      to="/"
      search={{ tab: "market" }}
      aria-current={active ? "page" : undefined}
      className="relative flex h-full flex-col items-center justify-end gap-0.5 pb-1 text-muted-foreground transition-colors active:bg-muted"
      onClick={(event) => preventActiveNavigation(event, active)}
    >
      <span
        className={cn(
          "absolute -top-3 flex size-12 items-center justify-center rounded-full border border-border bg-primary p-1.5",
          active && "ring-2 ring-foreground/10",
        )}
      >
        <CLCLogo className="size-8 rounded-full" />
      </span>
      <span
        className={cn("font-medium text-[0.6875rem]", active && "font-semibold text-foreground")}
      >
        {label}
      </span>
    </Link>
  );
}

function preventActiveNavigation(event: MouseEvent<HTMLAnchorElement>, active: boolean) {
  if (active && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
  }
}
