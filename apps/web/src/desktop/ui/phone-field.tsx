import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Country } from "react-phone-number-input";
import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumber,
} from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import labels from "react-phone-number-input/locale/en.json";

import { getFlagEmoji } from "#/components/ui/country-utils";
import { cn } from "#/lib/utils";
import { type DeskPickerOption, DeskSearchPicker } from "#/desktop/ui/search-picker";

const countryLabels = labels as Record<string, string>;
const FALLBACK_COUNTRY: Country = ((import.meta.env.VITE_DEFAULT_COUNTRY as string | undefined) ??
  "KE") as Country;

function toCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return isSupportedCountry(normalized) ? (normalized as Country) : null;
}

/**
 * A phone number with its dialling code picked from a popover — the phone
 * field's country sheet, as a desktop picker. The country follows the same
 * rules: a saved number's own country first, then the detected one while the
 * field is empty and nobody has chosen.
 */
export function DeskPhoneField({
  id,
  value,
  onChange,
  onBlur,
  defaultCountry,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  defaultCountry?: string | null;
  invalid?: boolean;
}) {
  const { t, i18n } = useLingui();
  const numberCountry = value ? parsePhoneNumber(value)?.country : undefined;
  const [country, setCountry] = useState<Country>(
    numberCountry ?? toCountry(defaultCountry) ?? FALLBACK_COUNTRY,
  );
  const countryWasChosen = useRef(false);
  const detected = toCountry(defaultCountry);
  useEffect(() => {
    if (countryWasChosen.current) return;
    if (numberCountry) setCountry(numberCountry);
    else if (detected && value === "") setCountry(detected);
  }, [detected, numberCountry, value]);

  const options = useMemo<DeskPickerOption[]>(() => {
    let regionNames: Intl.DisplayNames | null = null;
    try {
      regionNames = new Intl.DisplayNames([i18n.locale], { type: "region" });
    } catch {
      regionNames = null;
    }
    return getCountries().map((code) => {
      const dial = getCountryCallingCode(code);
      return {
        value: code,
        label: regionNames?.of(code) ?? countryLabels[code] ?? code,
        keywords: `${countryLabels[code] ?? ""} +${dial} ${code}`,
        lead: (
          <>
            <span aria-hidden="true">{getFlagEmoji(code)}</span>
            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground" dir="ltr">
              +{dial}
            </span>
          </>
        ),
      };
    });
  }, [i18n.locale]);

  return (
    <div
      dir="ltr"
      className={cn(
        "flex h-9 w-full border border-foreground/25 bg-card focus-within:border-foreground",
        invalid && "border-destructive focus-within:border-destructive",
      )}
    >
      <DeskSearchPicker
        options={options}
        value={country}
        onValueChange={(code) => {
          countryWasChosen.current = true;
          setCountry(code as Country);
        }}
        ariaLabel={t`Select country code`}
        searchLabel={t`Search countries`}
        emptyMessage={t`No countries found`}
        className="h-full w-auto shrink-0 border-0 border-foreground/15 border-e"
        popoverClassName="w-72"
        trigger={
          <>
            <span aria-hidden="true">{getFlagEmoji(country)}</span>
            <span className="font-mono text-xs text-muted-foreground">
              +{getCountryCallingCode(country)}
            </span>
          </>
        }
      />
      <PhoneInput
        id={id}
        country={country}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        onBlur={onBlur}
        international
        aria-invalid={invalid}
        className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
