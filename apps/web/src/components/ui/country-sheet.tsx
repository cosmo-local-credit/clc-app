import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { getCountries, getCountryCallingCode } from "react-phone-number-input";
import labels from "react-phone-number-input/locale/en.json";
import { getFlagEmoji } from "#/components/ui/country-utils";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { cn } from "#/lib/utils.ts";

const countryLabels = labels as Record<string, string>;

type CountrySheetProps = {
  open: boolean;
  onClose: () => void;
  /** "phone-country" shows dial codes; "country" shows names only */
  mode: "phone-country" | "country";
  value: string;
  onChange: (value: string) => void;
};

export function CountrySheet({ open, onClose, mode, value, onChange }: CountrySheetProps) {
  const { i18n, t } = useLingui();
  const [search, setSearch] = useState("");

  const allCountries = getCountries();
  // Names in the active language where the runtime knows them, English otherwise.
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.locale], { type: "region" });
    } catch {
      return null;
    }
  }, [i18n.locale]);
  const nameOf = (code: string) => regionNames?.of(code) ?? countryLabels[code] ?? code;

  const filtered = allCountries.filter((code) => {
    const name = nameOf(code);
    const q = search.toLowerCase();
    if (!q) return true;
    // The English name still matches, for a search typed in another language.
    if (name.toLowerCase().includes(q)) return true;
    if ((countryLabels[code] ?? "").toLowerCase().includes(q)) return true;
    if (mode === "phone-country") {
      const dial = getCountryCallingCode(code);
      if (`+${dial}`.includes(q) || dial.includes(q)) return true;
    }
    return code.toLowerCase().includes(q);
  });

  return (
    <SheetRoot
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSearch("");
          onClose();
        }
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="h-[50dvh] max-h-[50dvh]" initialFocus={false}>
          <SheetHeader>
            <SheetTitle>
              {mode === "phone-country" ? t`Select country code` : t`Select country`}
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-3">
            <Input
              placeholder={t`Search…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t`Search countries`}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground text-sm">
                {t`No countries found`}
              </p>
            ) : (
              <div>
                {filtered.map((code) => {
                  const name = nameOf(code);
                  const isSelected = code === value;
                  return (
                    <div key={code}>
                      <SheetClose
                        render={
                          <button
                            type="button"
                            aria-label={t`Select ${name}`}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors",
                              "hover:bg-muted active:bg-muted",
                              isSelected && "bg-primary/5 font-medium text-primary",
                            )}
                            onClick={() => {
                              onChange(code);
                              setSearch("");
                            }}
                          />
                        }
                      >
                        <span className="text-base leading-none">{getFlagEmoji(code)}</span>
                        {mode === "phone-country" ? (
                          <>
                            <span className="w-12 shrink-0 font-mono text-muted-foreground text-xs">
                              +{getCountryCallingCode(code)}
                            </span>
                            <span className="truncate">{name}</span>
                          </>
                        ) : (
                          <span className="truncate">{name}</span>
                        )}
                      </SheetClose>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
