import { useLingui } from "@lingui/react/macro";
import { RiMoonLine, RiSunLine } from "react-icons/ri";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Toggle } from "#/components/ui/toggle";
import { cn } from "#/lib/utils";
import { type Theme, useHydratedTheme } from "#/providers/theme";

export function ThemeSelector({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();

  const options: { value: Theme; label: string }[] = [
    { value: "light", label: t`Light` },
    { value: "dark", label: t`Dark` },
  ];

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
