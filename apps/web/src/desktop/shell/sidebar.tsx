import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useState } from "react";
import {
  RiArticleLine,
  RiArrowRightSLine,
  RiMap2Line,
  RiPulseLine,
  RiSettings3Line,
  RiSideBarLine,
  RiWallet3Line,
} from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { desktopNavSelection, type DesktopScopeId } from "#/desktop/chrome";
import { MarketHomeLink, MarketScopeLink } from "#/desktop/shell/market-links";
import { useSidebarCollapsed } from "#/desktop/sidebar-state";
import { DeskTooltip, DeskTooltipProvider } from "#/desktop/ui/tooltip";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { cn } from "#/lib/utils";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { DESK_SELECTED_EDGE } from "#/desktop/ui/page";

const SCOPES: readonly { id: DesktopScopeId; label: ReactNode }[] = [
  { id: "offers", label: <Trans>Offers</Trans> },
  { id: "wants", label: <Trans>Wants</Trans> },
  { id: "vouchers", label: <Trans>Vouchers</Trans> },
  { id: "pools", label: <Trans>Pools</Trans> },
  { id: "catalogs", label: <Trans>Catalogs</Trans> },
];

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
 * The 224px sidebar, or the 56px rail. The rail keeps every destination and
 * control the sidebar has, as an icon with a name: it is the sidebar's
 * collapsed state, not a different set of places. The map forces the rail
 * (`rail`) and so has no Expand, but its Market icon opens the marketplace
 * lists the expanded sidebar shows beneath it.
 */
export function DesktopSidebar({ rail = false }: { rail?: boolean }) {
  const { t } = useLingui();
  const { collapsed: stored, toggle } = useSidebarCollapsed();
  const collapsed = rail || stored;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const selection = desktopNavSelection(pathname, search);
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  const address = auth.address;
  const name = profile.data?.name?.trim();
  const marketChild = selection.nav === "market" && Boolean(selection.scope);
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
  const postsLabel = t`Posts`;
  const settingsLabel = t`Settings`;
  const profileLabel = t`Edit profile`;

  const settingsLink = (
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
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2 border-sidebar-border border-b",
            collapsed ? "justify-center" : "px-3.5",
          )}
        >
          <CLCLogo sharp className="size-6" />
          {collapsed ? null : <span className="font-heading text-base font-bold">CLC</span>}
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
              aria-current={selection.nav === "market" && !marketChild ? "page" : undefined}
              aria-label={collapsed ? marketLabel : undefined}
              className={itemClass(selection.nav === "market" && (!selection.scope || collapsed))}
            >
              {body(<RiMap2Line aria-hidden="true" />, marketLabel)}
            </MarketHomeLink>
          </RailTip>
          {collapsed ? (
            <RailScopes current={selection.nav === "market" ? selection.scope : undefined} />
          ) : (
            <div className="ms-[17px] mt-0.5 mb-1.5 flex flex-col gap-px border-sidebar-border border-s ps-2">
              {SCOPES.map((scope) => (
                <MarketScopeLink
                  key={scope.id}
                  scope={scope.id}
                  aria-current={selection.scope === scope.id ? "page" : undefined}
                  className={cn(
                    "flex h-7 items-center px-2 text-xs font-medium hover:bg-sidebar-accent",
                    selection.scope === scope.id
                      ? "bg-sidebar-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scope.label}
                </MarketScopeLink>
              ))}
            </div>
          )}
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
          <RailTip show={collapsed} label={activityLabel}>
            <Link
              to="/"
              search={{ tab: "activity" }}
              aria-label={collapsed ? activityLabel : undefined}
              aria-current={selection.nav === "activity" ? "page" : undefined}
              className={itemClass(selection.nav === "activity")}
            >
              {body(<RiPulseLine aria-hidden="true" />, activityLabel)}
            </Link>
          </RailTip>
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
        </nav>
        {collapsed ? (
          <div className="flex shrink-0 flex-col items-center gap-1 border-sidebar-border border-t p-2.5">
            {rail ? null : (
              <DeskTooltip label={t`Expand`}>
                <button
                  type="button"
                  className={FOOTER_ICON}
                  aria-label={t`Expand`}
                  onClick={toggle}
                >
                  <RiSideBarLine aria-hidden="true" className="rtl:-scale-x-100" />
                </button>
              </DeskTooltip>
            )}
            <DeskTooltip label={settingsLabel}>{settingsLink}</DeskTooltip>
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
        ) : (
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
            <DeskTooltip label={settingsLabel}>{settingsLink}</DeskTooltip>
          </div>
        )}
      </aside>
    </DeskTooltipProvider>
  );
}

/**
 * The rail's way to the marketplace lists. The expanded sidebar lists them
 * under Market; here they open from a control beside the Market icon, so the
 * map, where the rail is forced, still reaches every list.
 */
function RailScopes({ current }: { current: DesktopScopeId | undefined }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const label = t`Marketplace lists`;
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <DeskTooltip label={label}>
        <PopoverTrigger
          aria-label={label}
          className="mx-auto flex h-5 w-full items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <RiArrowRightSLine aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        </PopoverTrigger>
      </DeskTooltip>
      <PopoverContent side="inline-end" align="start" sideOffset={4} className="w-44 p-1">
        <PopoverTitle className="sr-only">
          <Trans>Marketplace</Trans>
        </PopoverTitle>
        <nav aria-label={t`Marketplace`} className="flex flex-col">
          {SCOPES.map((scope) => (
            <MarketScopeLink
              key={scope.id}
              scope={scope.id}
              aria-current={current === scope.id ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-8 items-center px-3 text-sm hover:bg-muted",
                current === scope.id
                  ? `bg-muted font-semibold ${DESK_SELECTED_EDGE}`
                  : "font-medium",
              )}
            >
              {scope.label}
            </MarketScopeLink>
          ))}
        </nav>
      </PopoverContent>
    </PopoverRoot>
  );
}
