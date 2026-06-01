import { RiLogoutBoxRLine, RiShieldCheckLine } from "react-icons/ri";

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
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1>Settings</h1>
				<p className="text-muted-foreground text-sm">
					Manage your wallet session and app preferences.
				</p>
			</div>

			<section aria-labelledby="wallet-session-title" className="space-y-3">
				<h2 id="wallet-session-title">Wallet session</h2>
				<div className="border border-border bg-card p-4">
					<div className="flex items-start gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
							<RiShieldCheckLine className="size-5" aria-hidden="true" />
						</div>
						<div className="min-w-0">
							<p className="font-medium text-sm">Connected address</p>
							<p className="mt-1 truncate font-mono text-muted-foreground text-xs">
								{address ?? "No address available"}
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
					{isSigningOut ? "Signing out..." : "Sign out"}
				</Button>
			</section>
		</div>
	);
}
