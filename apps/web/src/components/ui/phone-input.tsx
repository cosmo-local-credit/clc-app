import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Country } from "react-phone-number-input";
import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumber,
} from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import { CountrySheet } from "#/components/ui/country-sheet";
import { getFlagEmoji } from "#/components/ui/country-utils";
import { cn } from "#/lib/utils.ts";

type PhoneInputFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * ISO country the dialling code starts on, e.g. the one detected for the
   * profile. Adopted only while the field is empty and the person has not
   * picked a country themselves, so a late-arriving detection never rewrites a
   * number already being typed. Unsupported or absent falls back to the build's
   * default country.
   */
  defaultCountry?: string | null;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
};

const FALLBACK_COUNTRY: Country = ((import.meta.env.VITE_DEFAULT_COUNTRY as string | undefined) ??
  "KE") as Country;

function toCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return isSupportedCountry(normalized) ? (normalized as Country) : null;
}

export function PhoneInputField({
  id,
  value,
  onChange,
  defaultCountry,
  className,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: PhoneInputFieldProps) {
  const numberCountry = value ? parsePhoneNumber(value)?.country : undefined;
  const [country, setCountry] = useState<Country>(
    numberCountry ?? toCountry(defaultCountry) ?? FALLBACK_COUNTRY,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const countryWasChosen = useRef(false);

  const detected = toCountry(defaultCountry);
  useEffect(() => {
    if (countryWasChosen.current) return;
    // A saved international number takes priority over location or build defaults.
    if (numberCountry) setCountry(numberCountry);
    else if (detected && value === "") setCountry(detected);
  }, [detected, numberCountry, value]);

  const callingCode = getCountryCallingCode(country);

  return (
    <>
      <div
        dir="ltr"
        className={cn(
          "flex h-9 w-full border border-input bg-card transition-[border-color]",
          "focus-within:border-foreground",
          ariaInvalid &&
            "border-destructive ring-1 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
          className,
        )}
      >
        <button
          type="button"
          aria-label={`Country: ${country}`}
          onClick={() => setSheetOpen(true)}
          className={cn(
            "flex shrink-0 items-center gap-1 border-input border-e px-3",
            "text-foreground text-sm transition-colors hover:bg-muted",
          )}
        >
          <span className="text-base leading-none">{getFlagEmoji(country)}</span>
          <span className="font-mono text-muted-foreground text-xs">+{callingCode}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>

        <PhoneInput
          id={id}
          country={country}
          value={value}
          onChange={(val) => onChange(val ?? "")}
          international
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent px-3 py-1 text-base outline-none",
            "placeholder:text-muted-foreground",
            "md:text-sm",
          )}
          aria-label={ariaLabel ?? "Phone number"}
          aria-invalid={ariaInvalid}
        />
      </div>

      <CountrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mode="phone-country"
        value={country}
        onChange={(code) => {
          countryWasChosen.current = true;
          setCountry(code as Country);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
