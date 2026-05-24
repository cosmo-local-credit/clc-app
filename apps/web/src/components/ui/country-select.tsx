import { ChevronDown } from "lucide-react";
import { useState } from "react";
import labels from "react-phone-number-input/locale/en.json";
import { CountrySheet } from "#/components/ui/country-sheet";
import { getFlagEmoji } from "#/components/ui/country-utils";
import { cn } from "#/lib/utils.ts";

const countryLabels = labels as Record<string, string>;

// ── Country select ─────────────────────────────────────────────────────────────

type CountrySelectProps = {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	"aria-invalid"?: boolean;
	"aria-label"?: string;
};

export function CountrySelect({
	id,
	value,
	onChange,
	"aria-invalid": ariaInvalid,
	"aria-label": ariaLabel,
}: CountrySelectProps) {
	const [open, setOpen] = useState(false);

	const label = value ? (countryLabels[value] ?? value) : "Select country";

	return (
		<>
			<button
				id={id}
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel ?? "Country"}
				data-invalid={ariaInvalid ? "" : undefined}
				onClick={() => setOpen(true)}
				className={cn(
					"flex h-9 w-full items-center gap-2 rounded-none border border-input bg-card",
					"px-3 py-1 text-sm transition-[border-color]",
					"hover:border-foreground focus-visible:border-foreground focus-visible:outline-none",
					!value && "text-muted-foreground",
					ariaInvalid && "border-destructive",
				)}
			>
				{value ? (
					<span className="text-base leading-none">{getFlagEmoji(value)}</span>
				) : null}
				<span className="truncate">{label}</span>
				<ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
			</button>

			<CountrySheet
				open={open}
				onClose={() => setOpen(false)}
				mode="country"
				value={value}
				onChange={(code) => {
					onChange(code);
					setOpen(false);
				}}
			/>
		</>
	);
}
