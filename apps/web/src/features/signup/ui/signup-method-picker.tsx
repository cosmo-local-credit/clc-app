import { Link } from "@tanstack/react-router";
import { LoaderCircle, ScanLine } from "lucide-react";
import { FaApple, FaGoogle } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
	onPasskey: () => void;
	loading: boolean;
	error: string | null;
	onPaperWallet: () => void;
};

export function SignupMethodPicker({
	onPasskey,
	loading,
	error,
	onPaperWallet,
}: Props) {
	const { provider } = usePlatformPasskeyLabel();
	const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
	const providerLabel = provider === "apple" ? "Apple ID" : "Google";

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-20">
				<div className="mb-12 flex flex-col items-center gap-4 text-center">
					<div className="space-y-1">
						<h1 className="font-heading text-2xl font-semibold">
							Create your wallet
						</h1>
						<p className="text-sm text-muted-foreground">
							Sign up to start exchanging vouchers and joining pools.
						</p>
					</div>
				</div>

				<div className="space-y-3">
					{/* Primary: passkey */}
					<Button
						className="h-11 w-full"
						onClick={onPasskey}
						disabled={loading}
					>
						{loading ? (
							<LoaderCircle className="mr-2 size-4 animate-spin" />
						) : (
							<ProviderIcon className="mr-2 size-4" />
						)}
						{loading ? "Creating wallet…" : `Continue with ${providerLabel}`}
					</Button>

					{error ? <p className="text-xs text-destructive">{error}</p> : null}

					{/* Divider */}
					<div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
						<div className="h-px flex-1 bg-border" />
						<span>or</span>
						<div className="h-px flex-1 bg-border" />
					</div>

					{/* Primary: paper wallet */}
					<Button className="h-11 w-full" onClick={onPaperWallet}>
						<ScanLine className="mr-2 size-4" />
						Create paper wallet
					</Button>

					{/* Sign in link */}
					<p className="pt-2 text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link
							to="/signin"
							className="font-medium text-foreground underline-offset-4 hover:underline"
						>
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
