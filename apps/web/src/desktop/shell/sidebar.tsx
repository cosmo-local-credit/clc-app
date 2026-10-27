import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  RiArticleLine,
  RiMap2Line,
  RiPulseLine,
  RiSettings3Line,
  RiSideBarLine,
  RiWallet3Line,
} from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { desktopNavSelection, type DesktopScopeId } from "#/desktop/chrome";
import { useSidebarCollapsed } from "#/desktop/sidebar-state";
import { DeskTooltip, DeskTooltipProvider } from "#/desktop/ui/tooltip";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
} from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";

const SCOPES: readonly { id: DesktopScopeId; label: ReactNode }[] = [
  { id: "offers", label: <Trans>Offers</Trans> },
  { id: "wants", label: <Trans>Wants</Trans> },
  { id: "vouchers", label: <Trans>Vouchers</Trans> },
  { id: "pools", label: <Trans>Pools</Trans> },
  { id: "catalogs", label: <Trans>Catalogs</Trans> },
];

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
  const itemClass = (active: boolean) =>
    cn(
      "flex h-[34px] items-center gap-2.5 px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent [&_svg]:size-4 [&_svg]:shrink-0",
      collapsed && "justify-center px-0",
      active && "bg-sidebar-accent shadow-[inset_2px_0_0_var(--color-primary)]",
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
          {rail ? null : (
            <DeskTooltip label={collapsed ? t`Expand` : t`Collapse`}>
              <button
                type="button"
                className={cn(
                  "flex size-7 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  collapsed ? "hidden" : "ms-auto",
                )}
                aria-label={collapsed ? t`Expand` : t`Collapse`}
                onClick={toggle}
              >
                <RiSideBarLine aria-hidden="true" />
              </button>
            </DeskTooltip>
          )}
        </div>
        <nav
          aria-label={t`Primary navigation`}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2.5"
        >
          <SidebarLink
            collapsed={collapsed}
            label={t`Market`}
            className={itemClass(selection.nav === "market" && (!selection.scope || collapsed))}
            current={selection.nav === "market" && !marketChild}
            icon={<RiMap2Line aria-hidden="true" />}
            to="/"
            search={(previous) => ({
              ...marketplaceSharedSearch(previous),
              tab: "market" as const,
              view: "map" as const,
            })}
          />
          {collapsed ? null : (
            <div className="ms-[17px] mt-0.5 mb-1.5 flex flex-col gap-px border-sidebar-border border-s ps-2">
              {SCOPES.map((scope) => (
                <Link
                  key={scope.id}
                  to="/market"
                  search={(previous) => ({
                    ...marketplaceSearchForScope(marketplaceSharedSearch(previous), scope.id),
                    view: "map" as const,
                  })}
                  aria-current={selection.scope === scope.id ? "page" : undefined}
                  className={cn(
                    "flex h-7 items-center px-2 text-xs font-medium hover:bg-sidebar-accent",
                    selection.scope === scope.id
                      ? "bg-sidebar-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scope.label}
                </Link>
              ))}
            </div>
          )}
          <SidebarLink
            collapsed={collapsed}
            label={t`Wallet`}
            className={itemClass(selection.nav === "wallet")}
            current={selection.nav === "wallet"}
            icon={<RiWallet3Line aria-hidden="true" />}
            to="/"
            search={{ tab: "wallet" }}
          />
          <SidebarLink
            collapsed={collapsed}
            label={t`Activity`}
            className={itemClass(selection.nav === "activity")}
            current={selection.nav === "activity"}
            icon={<RiPulseLine aria-hidden="true" />}
            to="/"
            search={{ tab: "activity" }}
          />
          <SidebarLink
            collapsed={collapsed}
            label={t`Posts`}
            className={itemClass(selection.nav === "posts")}
            current={selection.nav === "posts"}
            icon={<RiArticleLine aria-hidden="true" />}
            to="/"
            search={{ tab: "posts" }}
          />
        </nav>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2.5 border-sidebar-border border-t p-2.5",
            collapsed && "justify-center",
          )}
        >
          {address ? (
            <Link
              to="/settings/profile"
              aria-label={collapsed ? t`Edit profile` : undefined}
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-2xs font-bold">
                {initials(name, address)}
              </span>
              {collapsed ? null : (
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
              )}
            </Link>
          ) : collapsed ? null : (
            <span className="flex-1" />
          )}
          {collapsed && address ? null : (
            <Link
              to="/"
              search={{ tab: "settings" }}
              aria-label={t`Settings`}
              aria-current={selection.nav === "settings" ? "page" : undefined}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                selection.nav === "settings" && "bg-sidebar-accent text-foreground",
              )}
            >
              <RiSettings3Line aria-hidden="true" />
            </Link>
          )}
        </div>
      </aside>
    </DeskTooltipProvider>
  );
}

function SidebarLink({
  collapsed,
  label,
  className,
  current,
  icon,
  to,
  search,
}: {
  collapsed: boolean;
  label: string;
  className: string;
  current: boolean;
  icon: ReactNode;
  to: "/";
  search:
    | { tab: "wallet" | "activity" | "posts" }
    | ((previous: Record<string, unknown>) => { tab: "market"; view: "map" });
}) {
  const link = (
    <Link
      to={to}
      search={search as never}
      aria-label={collapsed ? label : undefined}
      aria-current={current ? "page" : undefined}
      className={className}
    >
      {icon}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return <DeskTooltip label={label}>{link}</DeskTooltip>;
}
