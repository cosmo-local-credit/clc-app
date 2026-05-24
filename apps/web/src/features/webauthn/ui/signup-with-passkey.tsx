import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { FaApple, FaGoogle } from "react-icons/fa";
import { useConnect } from "wagmi";
import { Button } from "#/components/ui";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburRecovery } from "#/features/webauthn/hooks/use-calibur-recovery";
import { useCaliburSignup } from "#/features/webauthn/hooks/use-calibur-signup";
import { usePlatformPasskeyLabel } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { hasWebAuthnCredential } from "#/lib/webauthn-storage";
import { caliburConnector } from "#/providers/web3-config";

export function SignupWithPasskey({
	client,
	onSuccess,
}: {
	client: RelayerClient;
	onSuccess: () => void;
}) {
	const { provider, label } = usePlatformPasskeyLabel();
	const {
		step: recoveryStep,
		outcome,
		error: recoveryError,
		recover,
	} = useCaliburRecovery(client);
	const {
		step: signupStep,
		error: signupError,
		signup,
	} = useCaliburSignup(client);
	const { connect } = useConnect();
	const [mode, setMode] = useState<"recover" | "signup">("recover");

	const isRecovering = ["challenging", "asserting", "verifying"].includes(
		recoveryStep,
	);
	const isCreating = [
		"generating-key",
		"creating-passkey",
		"registering",
	].includes(signupStep);
	const loading = isRecovering || isCreating;
	const error = recoveryError ?? signupError;

	useEffect(() => {
		if (recoveryStep === "done" || signupStep === "done") {
			connect({ connector: caliburConnector }, { onSuccess });
		}
	}, [recoveryStep, signupStep, connect, onSuccess]);

	useEffect(() => {
		if (outcome === "not_found") {
			setMode("signup");
		}
	}, [outcome]);

	const ProviderIcon = provider === "apple" ? FaApple : FaGoogle;
	const hasLocal = hasWebAuthnCredential();
	const continueLabel =
		provider === "apple" ? "Continue with Apple ID" : "Continue with Google";

	if (mode === "signup") {
		return (
			<div className="space-y-2">
				<p className="text-center text-sm text-muted-foreground">
					No existing wallet found.
				</p>
				<Button
					className="h-11 w-full"
					onClick={() => signup.mutate()}
					disabled={loading}
				>
					{isCreating ? (
						<LoaderCircle className="mr-2 size-4 animate-spin" />
					) : (
						<ProviderIcon className="mr-2 size-4" />
					)}
					{isCreating
						? "Creating wallet…"
						: `Create with ${provider === "apple" ? "Apple ID" : "Google"}`}
				</Button>
				{!loading ? (
					<Button
						variant="ghost"
						className="w-full text-xs"
						onClick={() => setMode("recover")}
					>
						Cancel
					</Button>
				) : null}
				{error ? <p className="text-xs text-destructive">{error}</p> : null}
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<Button
				className="h-11 w-full"
				onClick={() => recover.mutate()}
				disabled={loading}
			>
				{loading ? (
					<LoaderCircle className="mr-2 size-4 animate-spin" />
				) : (
					<ProviderIcon className="mr-2 size-4" />
				)}
				{loading ? "Connecting…" : hasLocal ? continueLabel : label}
			</Button>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
		</div>
	);
}
