import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CountryCode } from "react-phone-number-input";
import { getCountryCallingCode } from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import { CountrySheet, getFlagEmoji } from "#/components/ui/country-sheet";
import { cn } from "#/lib/utils.ts";

// ── Phone input ────────────────────────────────────────────────────────────────

type PhoneInputFieldProps = {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
	"aria-invalid"?: boolean;
	"aria-label"?: string;
};

const DEFAULT_COUNTRY: CountryCode = ((import.meta.env.VITE_DEFAULT_COUNTRY as
	| string
	| undefined) ?? "KE") as CountryCode;

export function PhoneInputField({
	id,
	value,
	onChange,
	className,
	"aria-invalid": ariaInvalid,
	"aria-label": ariaLabel,
}: PhoneInputFieldProps) {
	const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
	const [sheetOpen, setSheetOpen] = useState(false);

	const callingCode = getCountryCallingCode(country);

	return (
		<>
			<div
				className={cn(
					"flex h-9 w-full border border-input bg-card transition-[border-color]",
					"focus-within:border-foreground",
					ariaInvalid && "border-destructive",
					className,
				)}
			>
				{/* Country flag + dial code trigger */}
				<button
					type="button"
					aria-label={`Country: ${country}`}
					onClick={() => setSheetOpen(true)}
					className={cn(
						"flex shrink-0 items-center gap-1 border-r border-input px-3",
						"text-sm text-foreground transition-colors hover:bg-muted",
					)}
				>
					<span className="text-base leading-none">
						{getFlagEmoji(country)}
					</span>
					<span className="font-mono text-xs text-muted-foreground">
						+{callingCode}
					</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</button>

				{/* Phone number input */}
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
					setCountry(code as CountryCode);
					setSheetOpen(false);
				}}
			/>
		</>
	);
}
