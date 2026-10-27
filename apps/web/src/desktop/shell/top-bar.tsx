import { useLingui } from "@lingui/react/macro";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiNotification3Line, RiSearchLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { DeskCrumbs } from "#/desktop/shell/crumbs";
import { usePaletteStore } from "#/desktop/palette-store";
import { useDeskTrail } from "#/desktop/trail";
import { DeskKbd } from "#/desktop/ui/kbd";

export function DesktopTopBar() {
  const { t } = useLingui();
  const setOpen = usePaletteStore((state) => state.setOpen);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const trail = useDeskTrail((state) => state.label);
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);

  return (
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
      <Button variant="outline" size="icon" aria-label={t`Notifications`} asChild>
        <Link to="/" search={{ tab: "settings" }}>
          <RiNotification3Line />
        </Link>
      </Button>
    </header>
  );
}
