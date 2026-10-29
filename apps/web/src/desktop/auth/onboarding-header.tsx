import { isSupportedLocale, LOCALE_OPTIONS } from "@clc/i18n/locales";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { RiTranslate2 } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import { DeskSegment, DeskSegmentItem } from "#/desktop/ui/segment";
import { useLocale } from "#/providers/i18n";
import { useHydratedTheme } from "#/providers/theme";

/**
 * The bar above welcome, sign-in and setup: the brand at the start, and the
 * language and theme choices at the end. Both are the app's one preference
 * each (`useLocale`, `useHydratedTheme`), so a choice made here is the one
 * Settings shows afterwards. The bar sits outside the forms below it, and a
 * choice only re-renders them; whatever has been typed stays.
 */
export function DeskOnboardingHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b bg-card px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <CLCLogo className="size-6 shrink-0" sharp />
        <span className="font-heading text-lg font-bold">CLC</span>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-3">
        <LanguageMenu />
        <ThemeSwitch />
      </div>
    </header>
  );
}

/**
 * The language list in a popover. A choice loads its catalog before it
 * applies, so the popover stays open on that row's spinner and closes once the
 * catalog is active, or stays on the error.
 */
function LanguageMenu() {
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
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <RiTranslate2 aria-hidden="true" />
        <span className="sr-only">{t`Language`}: </span>
        {current ? (
          <bdi dir={current.direction} lang={current.code}>
            {current.nativeLabel}
          </bdi>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-0">
        {error ? (
          <p role="alert" className="px-3 pt-3 text-destructive text-xs">
            {t`Unable to load language. Reverted to English.`}
          </p>
        ) : null}
        <RadioGroup
          aria-label={t`Language`}
          value={locale}
          onValueChange={(next) => {
            if (typeof next !== "string" || !isSupportedLocale(next)) return;
            loadStarted.current = false;
            setAwaitingLoad(true);
            setLocale(next);
          }}
          className="gap-0"
        >
          {LOCALE_OPTIONS.map((option) => (
            <RadioGroupRow
              key={option.code}
              value={option.code}
              label={
                <bdi dir={option.direction} lang={option.code}>
                  {option.nativeLabel}
                </bdi>
              }
              busy={loading && option.code === locale}
              disabled={loading && option.code !== locale}
            />
          ))}
        </RadioGroup>
      </PopoverContent>
    </PopoverRoot>
  );
}

function ThemeSwitch() {
  const { t } = useLingui();
  const { theme, setTheme } = useHydratedTheme();

  return (
    <DeskSegment label={t`Theme`}>
      <DeskSegmentItem active={theme !== "dark"}>
        <button type="button" onClick={() => setTheme("light")}>
          <Trans>Light</Trans>
        </button>
      </DeskSegmentItem>
      <DeskSegmentItem active={theme === "dark"}>
        <button type="button" onClick={() => setTheme("dark")}>
          <Trans>Dark</Trans>
        </button>
      </DeskSegmentItem>
    </DeskSegment>
  );
}
