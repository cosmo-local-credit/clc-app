import { isSupportedLocale, LOCALE_OPTIONS } from "@clc/i18n/locales";
import { useLingui } from "@lingui/react/macro";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { ThemeToggle } from "#/components/theme-selector";
import { useLocale } from "#/providers/i18n";

const LOCALE_LABELS = Object.fromEntries(
  LOCALE_OPTIONS.map((option) => [option.code, option.nativeLabel]),
);

export function LanguageSelector() {
  const { t } = useLingui();
  const { locale, setLocale, loading, error } = useLocale();

  return (
    <div className="flex flex-col items-end gap-1">
      <SelectRoot
        items={LOCALE_LABELS}
        value={locale}
        disabled={loading}
        onValueChange={(nextLocale) => {
          if (isSupportedLocale(nextLocale)) setLocale(nextLocale);
        }}
      >
        <SelectTrigger
          aria-label={t`Language`}
          className="h-9 w-auto border-border font-medium text-foreground text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALE_OPTIONS.map((option) => (
            <SelectItem key={option.code} value={option.code} dir={option.direction}>
              {option.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
      {error ? (
        <p className="max-w-40 text-end text-[11px] text-destructive" role="alert">
          {t`Unable to load language. Reverted to English.`}
        </p>
      ) : null}
    </div>
  );
}

/** Top-right onboarding menu: change language and theme before signing in. */
export function OnboardingMenu() {
  return (
    <div className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] end-4 z-10 flex items-center gap-2">
      <ThemeToggle />
      <LanguageSelector />
    </div>
  );
}
