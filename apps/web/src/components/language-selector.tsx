import { isSupportedLocale, LOCALE_OPTIONS, type SupportedLocale } from "@clc/i18n/locales";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiTranslate2 } from "react-icons/ri";

import { ThemeToggle } from "#/components/theme-selector";
import { ActionRow } from "#/components/ui/action-row";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { cn } from "#/lib/utils";
import { useLocale } from "#/providers/i18n";

const LOCALE_LABELS = Object.fromEntries(
  LOCALE_OPTIONS.map((option) => [option.code, option.nativeLabel]),
);

export function LanguageSelector({ triggerClassName }: { triggerClassName?: string }) {
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
          className={cn(
            "h-9 w-auto border-border font-medium text-foreground text-xs",
            triggerClassName,
          )}
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
        <p className="max-w-40 text-end text-xs text-destructive" role="alert">
          {t`Unable to load language. Reverted to English.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Settings row: the current language in its own script, and a sheet listing
 * every language by its native name with the name in the active language
 * beneath.
 *
 * A choice loads its catalog before it applies, so the sheet stays open on
 * that row's spinner and closes once the catalog is active. When the catalog
 * fails, the provider reverts and the sheet stays open on the error.
 */
export function LanguageSettingsRow() {
  const { t } = useLingui();
  const { locale, setLocale, loading, error } = useLocale();
  const [open, setOpen] = useState(false);
  const [awaitingLoad, setAwaitingLoad] = useState(false);
  // The provider starts loading in its own effect after the choice renders,
  // so "not loading" right after choosing means "not started", not "done".
  const loadStarted = useRef(false);
  const current = LOCALE_OPTIONS.find((option) => option.code === locale);

  useEffect(() => {
    if (!awaitingLoad) return;
    if (loading) {
      loadStarted.current = true;
      return;
    }
    if (!loadStarted.current) return;
    setAwaitingLoad(false);
    if (!error) setOpen(false);
  }, [awaitingLoad, loading, error]);

  return (
    <>
      <ActionRow
        icon={<RiTranslate2 className="size-4" aria-hidden="true" />}
        label={t`Language`}
        value={
          current ? (
            <bdi dir={current.direction} lang={current.code}>
              {current.nativeLabel}
            </bdi>
          ) : null
        }
        onClick={() => setOpen(true)}
      />
      <SettingsSheet open={open} onOpenChange={setOpen} title={t`Language`}>
        {error ? (
          <SettingsSheetAlert>{t`Unable to load language. Reverted to English.`}</SettingsSheetAlert>
        ) : null}
        <LanguageOptions
          locale={locale}
          loading={loading}
          onChoose={(next) => {
            loadStarted.current = false;
            setAwaitingLoad(true);
            setLocale(next);
          }}
        />
      </SettingsSheet>
    </>
  );
}

function LanguageOptions({
  locale,
  loading,
  onChoose,
}: {
  locale: SupportedLocale;
  loading: boolean;
  onChoose: (locale: SupportedLocale) => void;
}) {
  const { t } = useLingui();
  const names = useMemo(() => languageNamesIn(locale), [locale]);

  return (
    <RadioGroup
      aria-label={t`Language`}
      value={locale}
      onValueChange={(next) => {
        if (typeof next === "string" && isSupportedLocale(next)) onChoose(next);
      }}
      className="gap-0 border border-border bg-card"
    >
      {LOCALE_OPTIONS.map((option) => {
        const name = names.get(option.code);
        return (
          <RadioGroupRow
            key={option.code}
            value={option.code}
            label={
              <bdi dir={option.direction} lang={option.code}>
                {option.nativeLabel}
              </bdi>
            }
            description={name !== option.nativeLabel ? name : undefined}
            busy={loading && option.code === locale}
            disabled={loading && option.code !== locale}
          />
        );
      })}
    </RadioGroup>
  );
}

/**
 * Each language's name in the active one, e.g. "Swahili" under "Kiswahili"
 * in English. Falls back to the English label where the engine has no name:
 * Chrome has none in English for Dzongkha.
 */
function languageNamesIn(locale: SupportedLocale): Map<SupportedLocale, string> {
  const intlLocale = LOCALE_OPTIONS.find((option) => option.code === locale)?.intlLocale ?? "en";
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames([intlLocale], { type: "language", fallback: "none" });
  } catch {
    displayNames = null;
  }
  return new Map(
    LOCALE_OPTIONS.map((option) => {
      // Bare "zh" names the language, not the script the catalog is written in.
      const tag = option.code === "zh" ? "zh-Hans" : option.code;
      return [option.code, displayNames?.of(tag) ?? option.label];
    }),
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
