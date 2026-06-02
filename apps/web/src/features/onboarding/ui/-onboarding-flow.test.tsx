import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOnboardingProfileFormOnNext,
	mockOnboardingWalletStepOnBack,
	mockOnboardingWalletStepOnDone,
	mockNavigate,
} = vi.hoisted(() => ({
	mockOnboardingProfileFormOnNext: vi.fn(),
	mockOnboardingWalletStepOnBack: vi.fn(),
	mockOnboardingWalletStepOnDone: vi.fn(),
	mockNavigate: vi.fn(),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock("./onboarding-profile-form", () => ({
	OnboardingProfileForm: ({
		onNext,
	}: {
		onNext: (data: ProfileInput) => void;
	}) => {
		return (
			<div data-testid="profile-form">
				<button
					type="button"
					onClick={() => {
						mockOnboardingProfileFormOnNext();
						onNext({
							name: "Alice",
							email: "alice@example.com",
							phone: "",
							location: {
								lat: -1.2921,
								lng: 36.8219,
								locationName: "Nairobi, Kenya",
								country: "KE",
							},
						});
					}}
				>
					profile-next
				</button>
			</div>
		);
	},
}));

vi.mock("./onboarding-wallet-step", () => ({
	OnboardingWalletStep: ({
		profileData,
		onBack,
		onDone,
	}: {
		profileData: ProfileInput;
		onBack: () => void;
		onDone: () => void;
	}) => {
		return (
			<div data-testid="wallet-step">
				<span data-testid="profile-name">{profileData.name}</span>
				<button
					type="button"
					onClick={() => {
						mockOnboardingWalletStepOnBack();
						onBack();
					}}
				>
					wallet-back
				</button>
				<button
					type="button"
					onClick={() => {
						mockOnboardingWalletStepOnDone();
						onDone();
					}}
				>
					wallet-done
				</button>
			</div>
		);
	},
}));

import { OnboardingFlow } from "./onboarding-flow";

beforeEach(() => {
	mockOnboardingProfileFormOnNext.mockClear();
	mockOnboardingWalletStepOnBack.mockClear();
	mockOnboardingWalletStepOnDone.mockClear();
	mockNavigate.mockClear();
});

describe("OnboardingFlow step transitions", () => {
	it("starts on the profile step", () => {
		render(<OnboardingFlow />);
		expect(screen.getByTestId("profile-form")).toBeTruthy();
		expect(screen.queryByTestId("wallet-step")).toBeNull();
	});

	it("moves to the wallet step after profile form submits", async () => {
		render(<OnboardingFlow />);
		fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
		expect(screen.queryByTestId("profile-form")).toBeNull();
		expect(await screen.findByTestId("wallet-step")).toBeTruthy();
	});

	it("passes profile data to the wallet step", () => {
		render(<OnboardingFlow />);
		fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
		expect(screen.getByTestId("profile-name").textContent).toBe("Alice");
	});

	it("returns to profile step when wallet step calls onBack", () => {
		render(<OnboardingFlow />);
		fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
		fireEvent.click(screen.getByRole("button", { name: "wallet-back" }));
		expect(screen.getByTestId("profile-form")).toBeTruthy();
		expect(screen.queryByTestId("wallet-step")).toBeNull();
	});

	it("navigates home when wallet step calls onDone", () => {
		render(<OnboardingFlow />);
		fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
		fireEvent.click(screen.getByRole("button", { name: "wallet-done" }));
		expect(mockOnboardingWalletStepOnDone).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
	});
});
