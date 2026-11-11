import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactElement, type ReactNode } from "react";
import {
  RiArticleLine,
  RiMap2Line,
  RiPulseLine,
  RiSettings3Line,
  RiSideBarLine,
  RiWallet3Line,
} from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { RESOURCE_HUE, RESOURCE_ICON } from "#/components/resource-tone";
import { UnreadCount, UnreadCountLabel } from "#/components/ui/unread-count";
import { desktopNavSelection, type DesktopScopeId } from "#/desktop/chrome";
import { MarketHomeLink, MarketScopeLink } from "#/desktop/shell/market-links";
import { useSidebarCollapsed } from "#/desktop/sidebar-state";
import { DeskTooltip, DeskTooltipProvider } from "#/desktop/ui/tooltip";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { canReachPrivateRoutes } from "#/features/auth/logic/private-routes";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useActivityCounts } from "#/features/messaging/hooks/use-activity-counts";
import { cn } from "#/lib/utils";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { DESK_SELECTED_EDGE } from "#/desktop/ui/page";

const SCOPES: readonly DesktopScopeId[] = ["offers", "wants", "vouchers", "pools", "catalogs"];

const FOOTER_ICON =
  "flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground";

function initials(name: string | undefined, address: string | undefined) {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return address ? address.slice(2, 4).toUpperCase() : "";
}

/** The labelled tooltip an icon-only rail control carries. The expanded sidebar has its text. */
function RailTip({
  show,
  label,
  children,
}: {
  show: boolean;
  label: ReactNode;
  children: ReactElement;
}) {
  return show ? <DeskTooltip label={label}>{children}</DeskTooltip> : children;
}

/**
 * The 192px sidebar, or the 56px rail. The rail keeps every destination and
 * control the sidebar has, as an icon with a name: it is the sidebar's
 * collapsed state, not a different set of places, and nothing but the person's
 * own Collapse puts it there. Resource lists remain top-level destinations in
 * both forms.
 */
export function DesktopSidebar() {
  const { t } = useLingui();
  const { collapsed, toggle } = useSidebarCollapsed();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const selection = desktopNavSelection(pathname, search);
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  // Wallet, Activity and Settings all sit behind `AuthenticatedRoute`. A guest
  // who clicks one only reaches the sign-in gate, so they are not offered.
  const privateNav = canReachPrivateRoutes(auth);
  // Transactions plus Messages and Helpdesk; the messaging part is zero while it is off.
  const unreadActivity = useActivityCounts().total;
  const address = auth.address;
  const name = profile.data?.name?.trim();
  const settingsCurrent = selection.nav === "settings";
  const itemClass = (active: boolean) =>
    cn(
      "flex h-[34px] items-center gap-2.5 px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent [&_svg]:size-4 [&_svg]:shrink-0",
      collapsed && "justify-center px-0",
      active && `bg-sidebar-accent ${DESK_SELECTED_EDGE}`,
    );
  const body = (icon: ReactNode, label: string) => (
    <>
      {icon}
      {collapsed ? null : <span>{label}</span>}
    </>
  );

  const marketLabel = t`Market`;
  const walletLabel = t`Wallet`;
  const activityLabel = t`Activity`;
  const activityRailLabel =
    unreadActivity > 0
      ? t`Activity, ${plural(unreadActivity, { one: "# new", other: "# new" })}`
      : activityLabel;
  const postsLabel = t`Posts`;
  const settingsLabel = t`Settings`;
  const profileLabel = t`Edit profile`;

  const settingsLink = !privateNav ? null : (
    <Link
      to="/"
      search={{ tab: "settings" }}
      aria-label={settingsLabel}
      aria-current={settingsCurrent ? "page" : undefined}
      className={cn(FOOTER_ICON, settingsCurrent && "bg-sidebar-accent text-foreground")}
    >
      <RiSettings3Line aria-hidden="true" />
    </Link>
  );
  const avatar = (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-2xs font-bold">
      {initials(name, address)}
    </span>
  );

  return (
    <DeskTooltipProvider>
      <aside
        className={cn(
          "flex h-dvh shrink-0 flex-col border-sidebar-border border-e bg-sidebar text-sidebar-foreground",
          collapsed ? "w-14" : "w-48",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2 border-sidebar-border border-b",
            collapsed ? "justify-center" : "px-3.5",
          )}
        >
          {/* The brand is the way home, as it is on every other site. */}
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <CLCLogo sharp className="size-6" />
            {/* Kept for the link's name when the rail hides it. */}
            <span className={cn("font-heading text-base font-bold", collapsed && "sr-only")}>
              CLC
            </span>
          </Link>
          {collapsed ? null : (
            <DeskTooltip label={t`Collapse`}>
              <button
                type="button"
                className="ms-auto flex size-7 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label={t`Collapse`}
                onClick={toggle}
              >
                <RiSideBarLine aria-hidden="true" className="rtl:-scale-x-100" />
              </button>
            </DeskTooltip>
          )}
        </div>
        <nav
          aria-label={t`Primary navigation`}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2.5"
        >
          <RailTip show={collapsed} label={marketLabel}>
            <MarketHomeLink
              aria-current={selection.nav === "market" && !selection.scope ? "page" : undefined}
              aria-label={collapsed ? marketLabel : undefined}
              className={itemClass(selection.nav === "market" && !selection.scope)}
            >
              {body(<RiMap2Line aria-hidden="true" />, marketLabel)}
            </MarketHomeLink>
          </RailTip>
          {SCOPES.map((scope) => {
            const Icon = RESOURCE_ICON[scope];
            const label =
              scope === "offers"
                ? t`Offers`
                : scope === "wants"
                  ? t`Wants`
                  : scope === "vouchers"
                    ? t`Vouchers`
                    : scope === "pools"
                      ? t`Pools`
                      : t`Catalogs`;
            return (
              <RailTip key={scope} show={collapsed} label={label}>
                <MarketScopeLink
                  scope={scope}
                  aria-current={selection.scope === scope ? "page" : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    itemClass(selection.scope === scope),
                    RESOURCE_HUE[scope],
                    "[&_svg]:text-(--ink)",
                  )}
                >
                  {body(<Icon aria-hidden="true" />, label)}
                </MarketScopeLink>
              </RailTip>
            );
          })}
          <RailTip show={collapsed} label={postsLabel}>
            <Link
              to="/"
              search={{ tab: "posts" }}
              aria-label={collapsed ? postsLabel : undefined}
              aria-current={selection.nav === "posts" ? "page" : undefined}
              className={itemClass(selection.nav === "posts")}
            >
              {body(<RiArticleLine aria-hidden="true" />, postsLabel)}
            </Link>
          </RailTip>
          {privateNav ? (
            <RailTip show={collapsed} label={activityLabel}>
              <Link
                to="/"
                search={{ tab: "activity" }}
                aria-label={collapsed ? activityRailLabel : undefined}
                aria-current={selection.nav === "activity" ? "page" : undefined}
                className={itemClass(selection.nav === "activity")}
              >
                <span className="relative flex">
                  <RiPulseLine aria-hidden="true" />
                  {collapsed ? (
                    <UnreadCount count={unreadActivity} className="absolute -top-2 -end-2.5" />
                  ) : null}
                </span>
                {collapsed ? null : (
                  <>
                    <span>
                      {activityLabel}
                      <UnreadCountLabel count={unreadActivity} />
                    </span>
                    <UnreadCount count={unreadActivity} className="ms-auto" />
                  </>
                )}
              </Link>
            </RailTip>
          ) : null}
          {privateNav ? (
            <RailTip show={collapsed} label={walletLabel}>
              <Link
                to="/"
                search={{ tab: "wallet" }}
                aria-label={collapsed ? walletLabel : undefined}
                aria-current={selection.nav === "wallet" ? "page" : undefined}
                className={itemClass(selection.nav === "wallet")}
              >
                {body(<RiWallet3Line aria-hidden="true" />, walletLabel)}
              </Link>
            </RailTip>
          ) : null}
        </nav>
        {collapsed ? (
          <div className="flex shrink-0 flex-col items-center gap-1 border-sidebar-border border-t p-2.5">
            <DeskTooltip label={t`Expand`}>
              <button type="button" className={FOOTER_ICON} aria-label={t`Expand`} onClick={toggle}>
                <RiSideBarLine aria-hidden="true" className="rtl:-scale-x-100" />
              </button>
            </DeskTooltip>
            {settingsLink ? <DeskTooltip label={settingsLabel}>{settingsLink}</DeskTooltip> : null}
            {address ? (
              <DeskTooltip label={profileLabel}>
                <Link
                  to="/settings/profile"
                  aria-label={profileLabel}
                  className="flex size-8 shrink-0 items-center justify-center"
                >
                  {avatar}
                </Link>
              </DeskTooltip>
            ) : null}
          </div>
        ) : !address && !settingsLink ? null : (
          <div className="flex shrink-0 items-center gap-2.5 border-sidebar-border border-t p-2.5">
            {address ? (
              <Link to="/settings/profile" className="flex min-w-0 flex-1 items-center gap-2.5">
                {avatar}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {name || formatVoucherAddress(address)}
                  </span>
                  <span
                    className="block truncate font-mono text-2xs text-muted-foreground"
                    dir="ltr"
                  >
                    {formatVoucherAddress(address)}
                  </span>
                </span>
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {settingsLink ? <DeskTooltip label={settingsLabel}>{settingsLink}</DeskTooltip> : null}
          </div>
        )}
      </aside>
    </DeskTooltipProvider>
  );
}
