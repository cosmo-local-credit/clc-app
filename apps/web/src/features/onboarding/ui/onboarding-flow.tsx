import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { OnboardingProfileForm } from "./onboarding-profile-form";
import { OnboardingWalletStep } from "./onboarding-wallet-step";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = "profile" | "wallet";

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Two-step onboarding flow:
 *   1. Profile form  — collects name, country, email/phone
 *   2. Wallet step   — generates paper wallet, optional Calibur+WebAuthn link
 *
 * The flow is disconnected-only; IndexPage handles already-connected users.
 */
export function OnboardingFlow() {
	const navigate = useNavigate();
	const [step, setStep] = useState<Step>("profile");
	const [profileData, setProfileData] = useState<ProfileInput | null>(null);

	if (step === "wallet" && profileData) {
		return (
			<OnboardingWalletStep
				profileData={profileData}
				onBack={() => setStep("profile")}
				onDone={() => {
					void navigate({ to: "/", replace: true });
				}}
			/>
		);
	}

	return (
		<OnboardingProfileForm
			onNext={(data) => {
				setProfileData(data);
				setStep("wallet");
			}}
		/>
	);
}
