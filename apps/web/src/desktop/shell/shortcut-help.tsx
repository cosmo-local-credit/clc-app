import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useState } from "react";
import { create } from "zustand";

import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Button } from "#/components/ui/button";
import { Switch } from "#/components/ui/switch";
import { useCharacterShortcuts } from "#/desktop/shell/shortcut-state";
import { DeskKbd } from "#/desktop/ui/kbd";
import { cn } from "#/lib/utils";

type HelpState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

/** The shortcut list's open state, so the top bar, Settings and the palette can open it. */
export const useShortcutHelp = create<HelpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** The platform's modifier as the person's keyboard names it. */
export function useModKeyLabel() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);
  return mod;
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <dt className="text-sm">{children}</dt>
      <dd className="flex shrink-0 items-center gap-1">{keys}</dd>
    </div>
  );
}

/**
 * Every shortcut the desktop has, and the switch for the single-key ones.
 * Ctrl/⌘ K and Escape are not character keys and stay on.
 */
export function ShortcutHelp() {
  const { t } = useLingui();
  const open = useShortcutHelp((state) => state.open);
  const setOpen = useShortcutHelp((state) => state.setOpen);
  const { enabled, setEnabled } = useCharacterShortcuts();
  const mod = useModKeyLabel();

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="max-w-md rounded-none border border-border bg-card shadow-none">
          <DialogTitle>
            <Trans>Keyboard shortcuts</Trans>
          </DialogTitle>
          <dl className="mt-4 grid divide-y divide-border">
            <Row
              keys={
                <>
                  <DeskKbd>{mod}</DeskKbd>
                  <DeskKbd>K</DeskKbd>
                </>
              }
            >
              <Trans>Search</Trans>
            </Row>
            <Row keys={<DeskKbd>Esc</DeskKbd>}>
              <Trans>Close the top panel</Trans>
            </Row>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 border-border border-t pt-4">
            <span id="single-key-shortcuts" className="text-sm font-semibold">
              <Trans>Single-key shortcuts</Trans>
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby="single-key-shortcuts"
            />
          </div>
          <dl className={cn("mt-2 grid divide-y divide-border", !enabled && "opacity-50")}>
            <Row keys={<DeskKbd>/</DeskKbd>}>
              <Trans>Focus search</Trans>
            </Row>
            <Row keys={<DeskKbd>[</DeskKbd>}>
              <Trans>Collapse or expand the sidebar</Trans>
            </Row>
            <Row
              keys={
                <>
                  <DeskKbd>J</DeskKbd>
                  <DeskKbd>K</DeskKbd>
                </>
              }
            >
              <Trans>Next and previous row</Trans>
            </Row>
            <Row
              keys={
                <>
                  <DeskKbd>G</DeskKbd>
                  <DeskKbd>M</DeskKbd>
                </>
              }
            >
              <Trans>Go to Market</Trans>
            </Row>
            <Row
              keys={
                <>
                  <DeskKbd>G</DeskKbd>
                  <DeskKbd>W</DeskKbd>
                </>
              }
            >
              <Trans>Go to Wallet</Trans>
            </Row>
            <Row
              keys={
                <>
                  <DeskKbd>G</DeskKbd>
                  <DeskKbd>A</DeskKbd>
                </>
              }
            >
              <Trans>Go to Activity</Trans>
            </Row>
            <Row keys={<DeskKbd>?</DeskKbd>}>
              <Trans>Show these shortcuts</Trans>
            </Row>
          </dl>
          <div className="mt-6 flex justify-end">
            <DialogClose render={<Button variant="outline">{t`Close`}</Button>} />
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
