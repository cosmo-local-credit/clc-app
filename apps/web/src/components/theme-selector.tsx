import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { IconType } from "react-icons";
import { RiContrast2Line, RiMoonLine, RiSunLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { SettingsSheet } from "#/components/ui/settings-sheet";
import { Toggle } from "#/components/ui/toggle";
import { cn } from "#/lib/utils";
import { type Theme, useHydratedTheme } from "#/providers/theme";

function useThemeOptions(): { value: Theme; label: string; Icon: IconType }[] {
  const { t } = useLingui();
  return [
    { value: "light", label: t`Light`, Icon: RiSunLine },
    { value: "dark", label: t`Dark`, Icon: RiMoonLine },
  ];
}

export function ThemeSelector({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();
  const options = useThemeOptions();

  return (
    <SelectRoot
      items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
      value={theme}
      onValueChange={(next) => {
        if (next === "light" || next === "dark") setTheme(next);
      }}
    >
      <SelectTrigger
        aria-label={t`Theme`}
        className={cn(
          "h-9 w-auto border-border font-medium text-foreground text-xs",
          triggerClassName,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

/** Settings row: the current theme, and a sheet that applies a choice as it is made. */
export function ThemeSettingsRow() {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();
  const options = useThemeOptions();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionRow
        icon={<RiContrast2Line className="size-4" aria-hidden="true" />}
        label={t`Theme`}
        value={options.find((option) => option.value === theme)?.label}
        onClick={() => setOpen(true)}
      />
      <SettingsSheet open={open} onOpenChange={setOpen} title={t`Theme`}>
        <RadioGroup
          aria-label={t`Theme`}
          value={theme}
          onValueChange={(next) => {
            if (next !== "light" && next !== "dark") return;
            setTheme(next);
            setOpen(false);
          }}
          className="gap-0 border border-border bg-card"
        >
          {options.map((option) => (
            <RadioGroupRow
              key={option.value}
              value={option.value}
              label={option.label}
              icon={<option.Icon className="size-4" aria-hidden="true" />}
            />
          ))}
        </RadioGroup>
      </SettingsSheet>
    </>
  );
}

/** Compact icon toggle for menus (e.g. onboarding) — flips between light and dark. */
export function ThemeToggle() {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();
  const isDark = theme === "dark";

  return (
    <Toggle
      variant="outline"
      size="icon"
      pressed={isDark}
      onPressedChange={(pressed) => setTheme(pressed ? "dark" : "light")}
      aria-label={t`Toggle theme`}
      className="text-foreground"
    >
      {isDark ? <RiMoonLine className="size-4" /> : <RiSunLine className="size-4" />}
    </Toggle>
  );
}
