import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";

import { useSiweAuth } from "#/features/auth/hooks/use-siwe-auth";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburSignup } from "#/features/webauthn/hooks/use-calibur-signup";
import { caliburConnector } from "#/providers/web3";
import {
	getProfileCompleted,
	markProfileCompleted,
} from "../state/profile-completed";
import { PaperWalletCreate } from "./paper-wallet-create";
import { ProfileForm } from "./profile-form";
import { SignupMethodPicker } from "./signup-method-picker";

// ── Constants ──────────────────────────────────────────────────────────────────

const RELAYER_URL: string =
	(import.meta.env.VITE_RELAYER_URL as string | undefined) ??
	"http://192.168.1.20:5003/api/v2/relayer";

const relayerClient = createRelayerClient(RELAYER_URL);

// ── Signup flow ────────────────────────────────────────────────────────────────

type Phase = "method" | "paper";

export function SignupFlow() {
	const { isConnected, address } = useAccount();
	const navigate = useNavigate();
	const { connect } = useConnect();
	const [phase, setPhase] = useState<Phase>("method");
	const [profileDone, setProfileDone] = useState(false);
	const siweAttempted = useRef(false);

	const {
		step: signupStep,
		error: signupError,
		signup,
	} = useCaliburSignup(relayerClient);

	const { authenticate } = useSiweAuth();

	const isCreating = [
		"generating-key",
		"creating-passkey",
		"registering",
	].includes(signupStep);

	function handleProfileExit() {
		markProfileCompleted();
		setProfileDone(true);
	}

	// Connect calibur connector after passkey signup completes
	useEffect(() => {
		if (signupStep === "done") {
			connect({ connector: caliburConnector });
		}
	}, [signupStep, connect]);

	// After wallet connects, run SIWE once to get a backend JWT.
	useEffect(() => {
		if (isConnected && !siweAttempted.current && !getProfileCompleted()) {
			siweAttempted.current = true;
			// Fire-and-forget: profile form still shows even if SIWE fails.
			void authenticate().catch((err: unknown) => {
				console.warn("[signup] SIWE auth failed:", err);
			});
		}
	}, [isConnected, authenticate]);

	// Navigate away once connected + profile collected (or already done)
	useEffect(() => {
		if (isConnected && (getProfileCompleted() || profileDone)) {
			void navigate({ to: "/", replace: true });
		}
	}, [isConnected, profileDone, navigate]);

	// Already connected and profile done → redirect immediately (e.g. direct URL visit)
	if (isConnected && getProfileCompleted()) {
		return null;
	}

	// Profile form after wallet creation
	if (isConnected && !getProfileCompleted() && !profileDone) {
		return (
			<ProfileForm
				address={address as `0x${string}`}
				onBack={handleProfileExit}
				onDone={handleProfileExit}
			/>
		);
	}

	// Paper wallet creation phase
	if (!isConnected && phase === "paper") {
		return <PaperWalletCreate onBack={() => setPhase("method")} />;
	}

	// Default: method picker
	return (
		<SignupMethodPicker
			onPasskey={() => signup.mutate()}
			loading={isCreating}
			error={signupError}
			onPaperWallet={() => setPhase("paper")}
		/>
	);
}
