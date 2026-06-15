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
import { type Theme, useHydratedTheme } from "#/providers/theme";

export function ThemeSelector() {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();

  const options: { value: Theme; label: string }[] = [
    { value: "light", label: t`Light` },
    { value: "dark", label: t`Dark` },
  ];

  return (
    <SelectRoot
      value={theme}
      onValueChange={(next) => {
        if (next === "light" || next === "dark") setTheme(next);
      }}
    >
      <SelectTrigger
        aria-label={t`Theme`}
        className="h-9 w-auto rounded-none border-border bg-card font-medium text-foreground text-xs focus-visible:border-foreground focus-visible:ring-0"
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
