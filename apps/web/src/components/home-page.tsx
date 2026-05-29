import { BadgeCheck, LogOut } from "lucide-react";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { clearAuthToken } from "#/features/auth/state/token";

export function HomePage() {
	const { address } = useAccount();
	const { disconnectAsync } = useDisconnect();
	const [isSigningOut, setIsSigningOut] = useState(false);

	async function handleSignOut() {
		setIsSigningOut(true);
		clearAuthToken();
		try {
			await disconnectAsync();
		} finally {
			setIsSigningOut(false);
		}
	}

	return (
		<div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
			<div className="mb-6 flex flex-col items-center gap-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground p-2">
					<CLCLogo className="size-10" />
				</div>
				<div className="space-y-1">
					<h1 className="font-bold font-heading text-[1.75rem] leading-tight">
						Wallet connected
					</h1>
					<p className="text-muted-foreground text-sm">
						The authenticated shell is available only after a wallet connection.
					</p>
				</div>
			</div>

			<div className="space-y-3">
				<div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
					<BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
					<div className="min-w-0 space-y-0.5">
						<p className="font-medium text-sm">Connected address</p>
						<p className="truncate font-mono text-muted-foreground text-xs">
							{address}
						</p>
					</div>
				</div>

				<Button
					variant="outline"
					className="h-11 w-full"
					onClick={() => {
						void handleSignOut();
					}}
					disabled={isSigningOut}
				>
					<LogOut className="mr-2 size-4" />
					{isSigningOut ? "Signing out..." : "Sign out"}
				</Button>
			</div>
		</div>
	);
}
