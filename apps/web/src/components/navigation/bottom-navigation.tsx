import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { RiArticleLine, RiNotification3Line, RiSettings3Line, RiWallet3Line } from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import type { HomeTab } from "#/lib/navigation/home-tabs";
import { cn } from "#/lib/utils";

export function BottomNavigation({
  activeTab,
  atActiveTabRoot,
}: {
  activeTab: HomeTab;
  atActiveTabRoot: boolean;
}) {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Primary navigation`}
      className="fixed inset-x-0 bottom-0 z-30 border-border border-t bg-card px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid h-16 grid-cols-5">
        <NavLink
          tab="wallet"
          label={t`Wallet`}
          activeTab={activeTab}
          atActiveTabRoot={atActiveTabRoot}
          icon={<RiWallet3Line />}
        />
        <NavLink
          tab="activity"
          label={t`Activity`}
          activeTab={activeTab}
          atActiveTabRoot={atActiveTabRoot}
          icon={<RiNotification3Line />}
        />
        <MarketNavLink label={t`Market`} activeTab={activeTab} atActiveTabRoot={atActiveTabRoot} />
        <NavLink
          tab="posts"
          label={t`Posts`}
          activeTab={activeTab}
          atActiveTabRoot={atActiveTabRoot}
          icon={<RiArticleLine />}
        />
        <NavLink
          tab="settings"
          label={t`Settings`}
          activeTab={activeTab}
          atActiveTabRoot={atActiveTabRoot}
          icon={<RiSettings3Line />}
        />
      </div>
    </nav>
  );
}

function NavLink({
  tab,
  label,
  activeTab,
  atActiveTabRoot,
  icon,
}: {
  tab: HomeTab;
  label: string;
  activeTab: HomeTab;
  atActiveTabRoot: boolean;
  icon: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <Link
      to="/"
      search={{ tab }}
      activeOptions={{ exact: true, explicitUndefined: true }}
      aria-current={active ? (atActiveTabRoot ? "page" : "true") : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors active:bg-muted",
        active && "text-foreground",
      )}
      onClick={(event) => preventActiveNavigation(event, active && atActiveTabRoot)}
    >
      <span className="flex size-6 items-center justify-center [&_svg]:size-4">{icon}</span>
      <span className={cn("font-medium text-[0.6875rem]", active && "font-semibold")}>{label}</span>
    </Link>
  );
}

function MarketNavLink({
  label,
  activeTab,
  atActiveTabRoot,
}: {
  label: string;
  activeTab: HomeTab;
  atActiveTabRoot: boolean;
}) {
  const active = activeTab === "market";
  return (
    <Link
      to="/market"
      search={{}}
      activeOptions={{ exact: true, explicitUndefined: true }}
      aria-current={active ? (atActiveTabRoot ? "page" : "true") : undefined}
      className="relative flex h-full flex-col items-center justify-end gap-0.5 pb-1 text-muted-foreground transition-colors active:bg-muted"
      onClick={(event) => preventActiveNavigation(event, active && atActiveTabRoot)}
    >
      <span
        className={cn(
          "absolute -top-3 flex size-12 items-center justify-center rounded-full border border-border bg-primary p-1.5",
          active && "ring-2 ring-foreground/10",
        )}
      >
        <CLCLogo className="size-8" />
      </span>
      <span
        className={cn("font-medium text-[0.6875rem]", active && "font-semibold text-foreground")}
      >
        {label}
      </span>
    </Link>
  );
}

function preventActiveNavigation(event: MouseEvent<HTMLAnchorElement>, atActiveRoot: boolean) {
  if (atActiveRoot && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
  }
}
