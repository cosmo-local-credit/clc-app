import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { desktopChrome, marketViewOf } from "#/desktop/chrome";
import { resolveMarketView } from "#/desktop/market/market-view";
import { CommandPalette } from "#/desktop/shell/command-palette";
import { ShortcutHelp } from "#/desktop/shell/shortcut-help";
import { DesktopShortcuts } from "#/desktop/shell/shortcuts";
import { DesktopSidebar } from "#/desktop/shell/sidebar";
import { DesktopTopBar } from "#/desktop/shell/top-bar";

export function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const declared = useRouterState({
    select: (state) => {
      for (let index = state.matches.length - 1; index >= 0; index -= 1) {
        const value = state.matches[index]?.staticData.desktop;
        if (value) return value;
      }
      return undefined;
    },
  });
  // A market link that names no view opens in the one last used, so the frame
  // follows the page it will hold, not the bare URL.
  const view = pathname === "/market" ? resolveMarketView(marketViewOf(search)) : undefined;
  const chrome = desktopChrome(pathname, view ? { ...search, view } : search, declared);
  return (
    <div className="flex h-dvh min-h-0 bg-background text-foreground">
      <DesktopSidebar rail={chrome === "map"} />
      <div className="flex min-w-0 flex-1 flex-col">
        {chrome === "map" ? null : <DesktopTopBar />}
        {chrome === "fallback" ? (
          <div className="flex min-h-0 flex-1 justify-center overflow-auto">
            <div className="w-[430px] min-h-full bg-background">{children}</div>
          </div>
        ) : chrome === "map" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
        ) : (
          <div className="@container min-h-0 flex-1 overflow-auto">{children}</div>
        )}
      </div>
      <CommandPalette />
      <ShortcutHelp />
      <DesktopShortcuts sidebarToggle={chrome !== "map"} />
    </div>
  );
}
