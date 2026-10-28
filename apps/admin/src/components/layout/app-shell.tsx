import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import {
  HiOutlineAdjustments,
  HiOutlineBell,
  HiOutlineCash,
  HiOutlineCollection,
  HiOutlineCube,
  HiOutlineFlag,
  HiOutlineHome,
  HiOutlineNewspaper,
  HiOutlineQrcode,
  HiOutlineSwitchHorizontal,
  HiOutlineTag,
  HiOutlineTicket,
  HiOutlineUsers,
} from "react-icons/hi";
import { MdOutlineNfc } from "react-icons/md";
import { BRAND_ICON_BASE } from "#/lib/brand";
import { CommandPalette } from "#/components/layout/command-palette";
import { OperatorMenu } from "#/components/layout/operator-menu";
import { RetirementPendingBadge } from "#/features/retirement/retirement-notification";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";

type NavPath =
  | "/"
  | "/pools"
  | "/vouchers"
  | "/retirement-requests"
  | "/users"
  | "/paper-wallets"
  | "/nfc-cards"
  | "/posts"
  | "/vocabulary"
  | "/reviews"
  | "/deployments"
  | "/protocol"
  | "/cash"
  | "/transactions"
  | "/transactions/vouchers"
  | "/transactions/pools"
  | "/transactions/otx";

const navItems: Array<{
  to: NavPath;
  label: string;
  icon: IconType;
  /** Dashboard owns "/" alone; the others also match their detail routes. */
  exact?: boolean;
  /**
   * Rendered as a nested list under the parent. Transactions is a section
   * rather than a page — the chain's two shapes and our own dispatch log read
   * differently enough to be separate tables — so its children are always
   * visible instead of hidden behind a disclosure. Three items is not a list
   * worth collapsing, and an operator chasing a stuck dispatch should not have
   * to open the section to discover it exists.
   */
  children?: Array<{ to: NavPath; label: string }>;
}> = [
  { to: "/", label: "Dashboard", icon: HiOutlineHome, exact: true },
  { to: "/users", label: "Accounts", icon: HiOutlineUsers },
  { to: "/paper-wallets", label: "Sign-in cards", icon: HiOutlineQrcode },
  { to: "/nfc-cards", label: "NFC cards", icon: MdOutlineNfc },
  { to: "/pools", label: "Pools", icon: HiOutlineCollection },
  { to: "/vouchers", label: "Vouchers", icon: HiOutlineTicket },
  { to: "/retirement-requests", label: "Retirement requests", icon: HiOutlineBell },
  { to: "/reviews", label: "Reviews", icon: HiOutlineFlag },
  { to: "/deployments", label: "Deployments", icon: HiOutlineCube },
  { to: "/protocol", label: "Protocol", icon: HiOutlineAdjustments },
  { to: "/cash", label: "Cash", icon: HiOutlineCash },
  { to: "/posts", label: "Posts", icon: HiOutlineNewspaper },
  { to: "/vocabulary", label: "Vocabulary", icon: HiOutlineTag },
  {
    to: "/transactions",
    label: "Transactions",
    icon: HiOutlineSwitchHorizontal,
    children: [
      { to: "/transactions/vouchers", label: "Vouchers" },
      { to: "/transactions/pools", label: "Pools" },
      { to: "/transactions/otx", label: "OTX" },
    ],
  },
];

export function AppShell() {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <AppShellInner />
        <CommandPalette />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppShellInner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <Sidebar collapsible="icon" className="border-sidebar-border border-r">
        {/* h-14 + border-b match the main header so the horizontal rule lines up */}
        <SidebarHeader className="border-sidebar-border h-14 shrink-0 items-center justify-center gap-0 border-b p-0 px-3">
          <Link
            to="/"
            aria-label="CLC Admin dashboard"
            className="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center"
          >
            <img src={`${BRAND_ICON_BASE}/logo.svg`} alt="" className="size-6 shrink-0" />
            <span className="font-heading text-foreground text-lg font-bold tracking-tight group-data-[collapsible=icon]:hidden">
              CLC Admin
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active = item.exact
                    ? pathname === item.to
                    : pathname === item.to || pathname.startsWith(`${item.to}/`);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        // A parent with children is highlighted by the child on
                        // screen, not by itself: two lit rows for one location
                        // reads as two places.
                        isActive={active && !item.children}
                        tooltip={item.label}
                        render={<Link to={item.to} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.to === "/retirement-requests" ? <RetirementPendingBadge /> : null}
                      {item.children ? (
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.to}>
                              <SidebarMenuSubButton
                                isActive={pathname === child.to}
                                render={<Link to={child.to} />}
                              >
                                <span>{child.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="border-border bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto flex items-center gap-2">
            <OperatorMenu />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </>
  );
}
