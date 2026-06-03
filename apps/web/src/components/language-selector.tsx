import { isSupportedLocale, LOCALE_OPTIONS } from "@clc/i18n/locales";
import { useLingui } from "@lingui/react/macro";
import {
	SelectContent,
	SelectItem,
	SelectRoot,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { useLocale } from "#/providers/i18n";

export function LanguageSelector() {
	const { t } = useLingui();
	const { locale, setLocale, loading, error } = useLocale();

	return (
		<div className="flex flex-col items-end gap-1">
			<SelectRoot
				value={locale}
				disabled={loading}
				onValueChange={(nextLocale) => {
					if (isSupportedLocale(nextLocale)) setLocale(nextLocale);
				}}
			>
				<SelectTrigger
					aria-label={t`Language`}
					className="h-9 w-auto rounded-none border-border bg-card font-medium text-foreground text-xs focus-visible:border-foreground focus-visible:ring-0"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{LOCALE_OPTIONS.map((option) => (
						<SelectItem key={option.code} value={option.code}>
							{option.nativeLabel}
						</SelectItem>
					))}
				</SelectContent>
			</SelectRoot>
			{error ? (
				<p
					className="max-w-40 text-right text-[11px] text-destructive"
					role="alert"
				>
					{t`Unable to load language. Reverted to English.`}
				</p>
			) : null}
		</div>
	);
}

export function OnboardingLanguageSelector() {
	return (
		<div className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 z-10">
			<LanguageSelector />
		</div>
	);
}
