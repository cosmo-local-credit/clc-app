import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiGroupLine, RiNotification3Line, RiSettings3Line, RiWallet3Line } from "react-icons/ri";

import { CLCLogo } from "#/components/ui/clc-logo";
import { cn } from "#/lib/utils";
import type { HomeTab } from "./tabs";

export function BottomNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}) {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Primary navigation`}
      className="fixed inset-x-0 bottom-0 z-50 border-border border-t bg-card px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid h-16 grid-cols-5">
        <NavButton
          tab="wallet"
          label={t`Wallet`}
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<RiWallet3Line />}
        />
        <NavButton
          tab="activity"
          label={t`Activity`}
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<RiNotification3Line />}
        />
        <MarketNavButton label={t`Market`} activeTab={activeTab} onTabChange={onTabChange} />
        <NavButton
          tab="pool"
          label={t`Pool`}
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<RiGroupLine />}
        />
        <NavButton
          tab="settings"
          label={t`Settings`}
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<RiSettings3Line />}
        />
      </div>
    </nav>
  );
}

function NavButton({
  tab,
  label,
  activeTab,
  onTabChange,
  icon,
}: {
  tab: HomeTab;
  label: string;
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  icon: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors active:bg-muted",
        active && "text-foreground",
      )}
      onClick={() => onTabChange(tab)}
    >
      <span className="flex size-6 items-center justify-center [&_svg]:size-4">{icon}</span>
      <span className={cn("font-medium text-[0.6875rem]", active && "font-semibold")}>{label}</span>
    </button>
  );
}

function MarketNavButton({
  label,
  activeTab,
  onTabChange,
}: {
  label: string;
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}) {
  const active = activeTab === "market";
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className="relative flex h-full flex-col items-center justify-end gap-0.5 pb-1 text-muted-foreground transition-colors active:bg-muted"
      onClick={() => onTabChange("market")}
    >
      <span
        className={cn(
          "absolute -top-3 flex size-12 items-center justify-center rounded-full border border-border bg-foreground p-1.5",
          "[--clc-logo-tile:#111827] dark:bg-[#1762B8] dark:[--clc-logo-tile:#1762B8]",
          active && "ring-2 ring-foreground/10",
        )}
      >
        <CLCLogo className="size-8 rounded-full" />
      </span>
      <span
        className={cn("font-medium text-[0.6875rem]", active && "font-semibold text-foreground")}
      >
        {label}
      </span>
    </button>
  );
}
