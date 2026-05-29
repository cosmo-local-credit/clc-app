import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Country } from "react-phone-number-input";
import { getCountryCallingCode } from "react-phone-number-input";
import PhoneInput from "react-phone-number-input/input";
import { CountrySheet } from "#/components/ui/country-sheet";
import { getFlagEmoji } from "#/components/ui/country-utils";
import { cn } from "#/lib/utils.ts";

type PhoneInputFieldProps = {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
	"aria-invalid"?: boolean;
	"aria-label"?: string;
};

const DEFAULT_COUNTRY: Country = ((import.meta.env.VITE_DEFAULT_COUNTRY as
	| string
	| undefined) ?? "KE") as Country;

export function PhoneInputField({
	id,
	value,
	onChange,
	className,
	"aria-invalid": ariaInvalid,
	"aria-label": ariaLabel,
}: PhoneInputFieldProps) {
	const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
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
				<button
					type="button"
					aria-label={`Country: ${country}`}
					onClick={() => setSheetOpen(true)}
					className={cn(
						"flex shrink-0 items-center gap-1 border-input border-r px-3",
						"text-foreground text-sm transition-colors hover:bg-muted",
					)}
				>
					<span className="text-base leading-none">
						{getFlagEmoji(country)}
					</span>
					<span className="font-mono text-muted-foreground text-xs">
						+{callingCode}
					</span>
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
					setCountry(code as Country);
					setSheetOpen(false);
				}}
			/>
		</>
	);
}
