import { useState } from "react";
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

// ── Country sheet ──────────────────────────────────────────────────────────────

type CountrySheetProps = {
	open: boolean;
	onClose: () => void;
	/** "phone-country" shows dial codes; "country" shows names only */
	mode: "phone-country" | "country";
	value: string;
	onChange: (value: string) => void;
};

export function CountrySheet({
	open,
	onClose,
	mode,
	value,
	onChange,
}: CountrySheetProps) {
	const [search, setSearch] = useState("");

	const allCountries = getCountries();

	const filtered = allCountries.filter((code) => {
		const name = countryLabels[code] ?? code;
		const q = search.toLowerCase();
		if (!q) return true;
		if (name.toLowerCase().includes(q)) return true;
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
						<SheetTitle className="text-base font-semibold">
							{mode === "phone-country"
								? "Select country code"
								: "Select country"}
						</SheetTitle>
					</SheetHeader>

					<div className="px-4 pb-3">
						<Input
							placeholder="Search…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label="Search countries"
						/>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto pb-safe">
						{filtered.length === 0 ? (
							<p className="px-4 py-6 text-center text-sm text-muted-foreground">
								No countries found
							</p>
						) : (
							<div>
								{filtered.map((code) => {
									const name = countryLabels[code] ?? code;
									const isSelected = code === value;
									return (
										<div key={code}>
											<SheetClose
												render={
													<button
														type="button"
														aria-label={`Select ${name}`}
														className={cn(
															"flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors",
															"hover:bg-muted active:bg-muted",
															isSelected &&
																"bg-primary/5 font-medium text-primary",
														)}
														onClick={() => {
															onChange(code);
															setSearch("");
														}}
													/>
												}
											>
												<span className="text-base leading-none">
													{getFlagEmoji(code)}
												</span>
												{mode === "phone-country" ? (
													<>
														<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
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
