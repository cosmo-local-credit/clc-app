import { useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { PaperWalletCustomization } from "./paper-wallet-types";

type Props = {
	value: PaperWalletCustomization;
	onChange: (next: PaperWalletCustomization) => void;
};

const MAX_LOGO_BYTES = 512 * 1024; // 512 KB
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Collapsible form for editing paper wallet card customization fields.
 *
 * Closed by default. When open, shows name, website, description inputs
 * and a logo upload + reset control.
 */
export function PaperWalletCustomizer({ value, onChange }: Props) {
	const [logoError, setLogoError] = useState<string | null>(null);
	const [logoFileName, setLogoFileName] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleFieldUpdate(
		field: Exclude<keyof PaperWalletCustomization, "logoDataUrl">,
		next: string,
	) {
		onChange({ ...value, [field]: next });
	}

	function handleLogoFile(target: HTMLInputElement) {
		const file = target.files?.[0];
		if (!file) return;

		// Validate type
		if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
			setLogoError("SVG files are not supported. Use PNG, JPEG, or WebP.");
			target.value = "";
			return;
		}

		// Validate size
		if (file.size > MAX_LOGO_BYTES) {
			setLogoError(
				`File too large (${(file.size / 1024).toFixed(0)} KB). Maximum is 512 KB.`,
			);
			target.value = "";
			return;
		}

		setLogoError(null);
		setLogoFileName(file.name);

		const reader = new FileReader();
		reader.onload = () => {
			onChange({
				...value,
				logoDataUrl: reader.result as string,
			});
		};
		reader.readAsDataURL(file);

		// Reset input so the same file can be re-selected
		target.value = "";
	}

	function handleResetLogo() {
		setLogoError(null);
		setLogoFileName(null);
		onChange({ ...value, logoDataUrl: null });
	}

	return (
		<details className="mt-6">
			<summary className="cursor-pointer text-sm font-medium text-foreground">
				Customize
			</summary>

			<div className="mt-4 space-y-4">
				{/* Name */}
				<div className="space-y-2">
					<label
						htmlFor="pw-name"
						className="text-sm font-medium text-foreground"
					>
						Name on wallet
					</label>
					<Input
						id="pw-name"
						maxLength={32}
						value={value.name}
						onChange={(event) => handleFieldUpdate("name", event.target.value)}
					/>
				</div>

				{/* Website */}
				<div className="space-y-2">
					<label
						htmlFor="pw-website"
						className="text-sm font-medium text-foreground"
					>
						Website
					</label>
					<Input
						id="pw-website"
						maxLength={40}
						value={value.website}
						onChange={(event) =>
							handleFieldUpdate("website", event.target.value)
						}
					/>
				</div>

				{/* Description */}
				<div className="space-y-2">
					<label
						htmlFor="pw-description"
						className="text-sm font-medium text-foreground"
					>
						Description
					</label>
					<textarea
						id="pw-description"
						rows={2}
						maxLength={80}
						value={value.description}
						onChange={(event) =>
							handleFieldUpdate("description", event.target.value)
						}
						className="w-full rounded-none border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
					/>
				</div>

				{/* Logo upload */}
				<div className="space-y-2">
					<label
						htmlFor="pw-logo-input"
						className="text-sm font-medium text-foreground"
					>
						Logo
					</label>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
						>
							Upload logo
						</Button>
						<input
							id="pw-logo-input"
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							onChange={(event) => {
								if (event.target) handleLogoFile(event.target);
							}}
						/>

						{value.logoDataUrl && logoFileName ? (
							<span className="max-w-full truncate text-xs text-muted-foreground">
								{logoFileName}
							</span>
						) : null}

						{value.logoDataUrl ? (
							<button
								type="button"
								className="text-sm text-destructive underline-offset-2 hover:underline"
								onClick={handleResetLogo}
							>
								Reset logo
							</button>
						) : null}
					</div>

					{logoError ? (
						<p className="text-xs text-destructive">{logoError}</p>
					) : null}
				</div>
			</div>
		</details>
	);
}
