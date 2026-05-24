import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, LogOut, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { Button } from "#/components/ui/button";
import { clearAuthToken } from "#/features/auth/state/token";
import { hasWebAuthnCredential } from "#/lib/webauthn-storage";

export function HomePage() {
	const { address, isConnected, status } = useAccount();
	const { disconnectAsync } = useDisconnect();
	const navigate = useNavigate();
	const [hasMounted, setHasMounted] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);

	useEffect(() => {
		setHasMounted(true);
	}, []);

	// Only redirect when wagmi has finished its reconnection attempt and the
	// account is genuinely disconnected — not while it is still reconnecting
	// (which would cause a spurious redirect on every SPA navigation).
	useEffect(() => {
		if (!hasMounted || status !== "disconnected") {
			return;
		}

		void navigate({
			to: hasWebAuthnCredential() ? "/signin" : "/signup",
			replace: true,
		});
	}, [hasMounted, status, navigate]);

	async function handleSignOut() {
		setIsSigningOut(true);
		clearAuthToken();
		try {
			await disconnectAsync();
		} finally {
			setIsSigningOut(false);
		}
	}

	if (!hasMounted || status === "connecting" || status === "reconnecting") {
		return null;
	}

	if (!isConnected) {
		return null;
	}

	return (
		<div className="flex min-h-screen flex-col bg-background px-6 pb-12 pt-20">
			<div className="mb-8 flex flex-col items-center gap-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground text-background">
					<Wallet className="size-7" />
				</div>
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-semibold">
						Wallet connected
					</h1>
					<p className="text-sm text-muted-foreground">
						The authenticated shell is available only after a wallet connection.
					</p>
				</div>
			</div>

			<div className="space-y-3">
				<div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
					<BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
					<div className="min-w-0 space-y-0.5">
						<p className="text-sm font-medium">Connected address</p>
						<p className="truncate font-mono text-xs text-muted-foreground">
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
