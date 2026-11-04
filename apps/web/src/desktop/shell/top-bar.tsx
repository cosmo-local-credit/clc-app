import { useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import { RiKeyboardLine, RiNotification3Line, RiSearchLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { DeskSignInAction } from "#/desktop/auth/sign-in-action";
import { DeskCrumbs } from "#/desktop/shell/crumbs";
import { usePaletteStore } from "#/desktop/palette-store";
import { useModKeyLabel, useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { useDeskTrail } from "#/desktop/trail";
import { DeskKbd } from "#/desktop/ui/kbd";
import { DeskTooltip, DeskTooltipProvider } from "#/desktop/ui/tooltip";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { canReachPrivateRoutes } from "#/features/auth/logic/private-routes";

export function DesktopTopBar() {
  const { t } = useLingui();
  const setOpen = usePaletteStore((state) => state.setOpen);
  const setHelpOpen = useShortcutHelp((state) => state.setOpen);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const trail = useDeskTrail((state) => state.label);
  const mod = useModKeyLabel();
  // Notification settings live on the Settings tab, which a guest cannot open;
  // the way in takes that slot and gates itself.
  const privateNav = canReachPrivateRoutes(useAuthStatus());
  const shortcutsLabel = t`Keyboard shortcuts`;
  const notificationsLabel = t`Notification settings`;

  return (
    <DeskTooltipProvider>
      <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b bg-card px-5">
        <div className="min-w-0 flex-1">
          <DeskCrumbs pathname={pathname} search={search} trail={trail} />
        </div>
        <Button
          type="button"
          variant="outline"
          data-desktop-search=""
          className="w-[340px] justify-start gap-2 px-2.5 text-sm font-normal text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <RiSearchLine aria-hidden="true" />
          <span className="flex-1 truncate text-start">{t`Search vouchers, pools, people`}</span>
          <DeskKbd>{mod}K</DeskKbd>
        </Button>
        <DeskTooltip label={shortcutsLabel} side="bottom">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={shortcutsLabel}
            onClick={() => setHelpOpen(true)}
          >
            <RiKeyboardLine aria-hidden="true" />
          </Button>
        </DeskTooltip>
        {privateNav ? (
          <DeskTooltip label={notificationsLabel} side="bottom">
            <Button variant="outline" size="icon" aria-label={notificationsLabel} asChild>
              <Link to="/" search={{ tab: "settings" }} hash="notifications">
                <RiNotification3Line aria-hidden="true" />
              </Link>
            </Button>
          </DeskTooltip>
        ) : null}
        <DeskSignInAction />
      </header>
    </DeskTooltipProvider>
  );
}
