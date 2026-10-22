import { useLingui } from "@lingui/react/macro";
import { RiMoonLine, RiSunLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useHydratedTheme } from "#/providers/theme";

function useThemeToggle() {
  const { t } = useLingui();
  const { theme, toggleTheme } = useHydratedTheme();
  const isDark = theme === "dark";
  return {
    accessibleLabel: t`Dark mode`,
    Icon: isDark ? RiMoonLine : RiSunLine,
    isDark,
    label: isDark ? t`Dark` : t`Light`,
    toggleTheme,
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { accessibleLabel, Icon, isDark, label, toggleTheme } = useThemeToggle();

  return (
    <Button
      variant="outline"
      aria-label={accessibleLabel}
      aria-pressed={isDark}
      className={cn("justify-start", className)}
      onClick={toggleTheme}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

/** Settings row: the current theme, toggled immediately without a second sheet. */
export function ThemeSettingsRow() {
  const { t } = useLingui();
  const { accessibleLabel, Icon, isDark, label, toggleTheme } = useThemeToggle();
  return (
    <ActionRow
      icon={<Icon className="size-4" aria-hidden="true" />}
      label={t`Theme`}
      value={label}
      ariaLabel={accessibleLabel}
      pressed={isDark}
      trailingIcon={false}
      onClick={toggleTheme}
    />
  );
}

export function ThemeSettingsButton() {
  const { accessibleLabel, Icon, isDark, toggleTheme } = useThemeToggle();
  return (
    <Button
      variant="outline"
      size="icon"
      tap
      aria-label={accessibleLabel}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}
