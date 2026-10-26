import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { desktopChrome } from "#/desktop/chrome";
import { CommandPalette } from "#/desktop/shell/command-palette";
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
  const chrome = desktopChrome(pathname, search, declared);
  return (
    <div className="flex h-dvh min-h-0 bg-background text-foreground">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {chrome === "map" ? null : <DesktopTopBar />}
        {chrome === "fallback" ? (
          <div className="flex min-h-0 flex-1 justify-center overflow-auto">
            <div className="w-[430px] min-h-full bg-background">{children}</div>
          </div>
        ) : chrome === "map" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        )}
      </div>
      <CommandPalette />
      <DesktopShortcuts />
    </div>
  );
}
