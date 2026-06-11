import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { readInitialTheme, type Theme, useThemeStore } from "#/providers/theme";

export function ThemeSelector() {
  const { t } = useLingui();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  // Sync the displayed value to the theme the bootstrap script already applied.
  // The store starts at "light" so the server and first client render match.
  useEffect(() => {
    setTheme(readInitialTheme());
  }, [setTheme]);

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
