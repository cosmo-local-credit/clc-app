import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "lucide-react";
import type { IconType } from "react-icons";
import {
  HiOutlineCollection,
  HiOutlineHome,
  HiOutlineTicket,
  HiOutlineUsers,
} from "react-icons/hi";
import { CommandPalette } from "#/components/layout/command-palette";
import { Button } from "#/components/ui/button";
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
  SidebarProvider,
  SidebarTrigger,
} from "#/components/ui/sidebar";
import { Toaster } from "#/components/ui/sonner";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useAdminSession, useAdminSignOut } from "#/features/auth/admin-session";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { useHydratedTheme } from "#/providers/theme";

const navItems: Array<{
  to: "/" | "/pools" | "/vouchers" | "/users";
  label: string;
  icon: IconType;
  /** Overview owns "/" alone; the others also match their detail routes. */
  exact?: boolean;
}> = [
  { to: "/", label: "Overview", icon: HiOutlineHome, exact: true },
  { to: "/pools", label: "Pools", icon: HiOutlineCollection },
  { to: "/vouchers", label: "Vouchers", icon: HiOutlineTicket },
  { to: "/users", label: "Pool owners", icon: HiOutlineUsers },
];

export function AppShell() {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <AppShellInner />
        <CommandPalette />
        <Toaster richColors closeButton position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppShellInner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        {/* h-14 + border-b match the main header so the horizontal rule lines up */}
        <SidebarHeader className="h-14 shrink-0 items-center justify-center gap-0 border-b border-sidebar-border p-0 px-3">
          <Link to="/" className="flex w-full items-center justify-center">
            <span className="font-heading text-lg font-bold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
              CLC Admin
            </span>
            <span className="hidden font-heading text-xl font-bold tracking-tight text-foreground group-data-[collapsible=icon]:inline">
              C
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
                        isActive={active}
                        tooltip={item.label}
                        render={<Link to={item.to} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto flex items-center gap-2">
            <OperatorMenu />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * The shell only renders inside AuthBoundary's authenticated branch, so the
 * session is known — but it is read rather than passed down so no surface has to
 * thread it through.
 */
function OperatorMenu() {
  const session = useAdminSession();
  const signOut = useAdminSignOut();

  if (session.status !== "authenticated") return null;

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="hidden font-data text-xs text-muted-foreground sm:inline">
              {formatVoucherAddress(session.operator.address as `0x${string}`)}
            </span>
          }
        />
        <TooltipContent>{session.operator.address}</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {signOut.isPending ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useHydratedTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Switch to ${next} theme`}
            onClick={() => setTheme(next)}
          >
            {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          </Button>
        }
      />
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  );
}
