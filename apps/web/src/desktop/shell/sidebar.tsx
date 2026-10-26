import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  RiArticleLine,
  RiMap2Line,
  RiNotification3Line,
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

export function DesktopSidebar() {
  const { t } = useLingui();
  const { collapsed, toggle } = useSidebarCollapsed();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const selection = desktopNavSelection(pathname, search);
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  const address = auth.address;
  const name = profile.data?.name?.trim();
  const itemClass = (active: boolean, parent: boolean) =>
    cn(
      "flex h-9 items-center gap-3 px-3 text-sm",
      active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      parent && !active && "text-foreground",
      !active && !parent && "text-sidebar-foreground/80 hover:bg-sidebar-accent",
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
            "flex h-14 items-center gap-2 border-sidebar-border border-b",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <CLCLogo sharp className="size-7" />
          {collapsed ? null : <span className="font-heading text-base font-semibold">CLC</span>}
        </div>
        <nav
          aria-label={t`Primary navigation`}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto py-2"
        >
          <SidebarLink
            collapsed={collapsed}
            label={t`Market`}
            className={itemClass(
              selection.nav === "market" && !selection.scope,
              selection.nav === "market" && Boolean(selection.scope),
            )}
            icon={<RiMap2Line aria-hidden="true" />}
            to="/"
            search={(previous) => ({
              ...marketplaceSharedSearch(previous),
              tab: "market" as const,
              view: "map" as const,
            })}
          />
          {collapsed ? null : (
            <div className="flex flex-col ps-9">
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
                    "flex h-8 items-center px-3 text-sm",
                    selection.scope === scope.id
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
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
            className={itemClass(selection.nav === "wallet", false)}
            icon={<RiWallet3Line aria-hidden="true" />}
            to="/"
            search={{ tab: "wallet" }}
          />
          <SidebarLink
            collapsed={collapsed}
            label={t`Activity`}
            className={itemClass(selection.nav === "activity", false)}
            icon={<RiNotification3Line aria-hidden="true" />}
            to="/"
            search={{ tab: "activity" }}
          />
          <SidebarLink
            collapsed={collapsed}
            label={t`Posts`}
            className={itemClass(selection.nav === "posts", false)}
            icon={<RiArticleLine aria-hidden="true" />}
            to="/"
            search={{ tab: "posts" }}
          />
        </nav>
        <div
          className={cn(
            "flex items-center gap-2 border-sidebar-border border-t",
            collapsed ? "flex-col px-1 py-2" : "px-2 py-2",
          )}
        >
          {address ? (
            <div className={cn("flex min-w-0 items-center gap-2", collapsed && "justify-center")}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-heading text-2xs font-semibold">
                {initials(name, address)}
              </span>
              {collapsed ? null : (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {name || formatVoucherAddress(address)}
                  </span>
                  {name ? (
                    <span
                      className="block truncate font-mono text-2xs text-muted-foreground"
                      dir="ltr"
                    >
                      {formatVoucherAddress(address)}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          ) : null}
          <div
            className={cn("flex items-center", collapsed ? "flex-col gap-1" : "ms-auto gap-0.5")}
          >
            <Link
              to="/"
              search={{ tab: "settings" }}
              aria-label={t`Settings`}
              aria-current={selection.nav === "settings" ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center",
                selection.nav === "settings"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent",
              )}
            >
              <RiSettings3Line aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="flex size-9 items-center justify-center hover:bg-sidebar-accent"
              aria-label={collapsed ? t`Expand` : t`Collapse`}
              onClick={toggle}
            >
              <RiSideBarLine aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </DeskTooltipProvider>
  );
}

function SidebarLink({
  collapsed,
  label,
  className,
  icon,
  to,
  search,
}: {
  collapsed: boolean;
  label: string;
  className: string;
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
      className={className}
    >
      {icon}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return <DeskTooltip label={label}>{link}</DeskTooltip>;
}
