import { Trans, useLingui } from "@lingui/react/macro";
import { RiLogoutBoxRLine, RiShieldCheckLine } from "react-icons/ri";

import { LanguageSelector } from "#/components/language-selector";
import { Button } from "#/components/ui/button";

export function SettingsPage({
	address,
	isSigningOut,
	onSignOut,
}: {
	address?: `0x${string}`;
	isSigningOut: boolean;
	onSignOut: () => void;
}) {
	const { t } = useLingui();

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1>
					<Trans>Settings</Trans>
				</h1>
				<p className="text-muted-foreground text-sm">
					<Trans>Manage your wallet session and app preferences.</Trans>
				</p>
			</div>

			<section aria-labelledby="language-title" className="space-y-3">
				<h2 id="language-title">
					<Trans>Language</Trans>
				</h2>
				<div className="border border-border bg-card p-4">
					<div className="flex items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							<Trans>Choose the app display language.</Trans>
						</p>
						<LanguageSelector />
					</div>
				</div>
			</section>

			<section aria-labelledby="wallet-session-title" className="space-y-3">
				<h2 id="wallet-session-title">
					<Trans>Wallet session</Trans>
				</h2>
				<div className="border border-border bg-card p-4">
					<div className="flex items-start gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
							<RiShieldCheckLine className="size-5" aria-hidden="true" />
						</div>
						<div className="min-w-0">
							<p className="font-medium text-sm">
								<Trans>Connected address</Trans>
							</p>
							<p className="mt-1 truncate font-mono text-muted-foreground text-xs">
								{address ?? t`No address available`}
							</p>
						</div>
					</div>
				</div>
				<Button
					variant="outline"
					className="h-11 w-full"
					onClick={onSignOut}
					disabled={isSigningOut}
				>
					<RiLogoutBoxRLine className="mr-2 size-4" aria-hidden="true" />
					{isSigningOut ? (
						<Trans>Signing out...</Trans>
					) : (
						<Trans>Sign out</Trans>
					)}
				</Button>
			</section>
		</div>
	);
}
