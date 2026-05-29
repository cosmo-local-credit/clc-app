import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";

const {
	mockUpgradeAndLinkMutate,
	mockUpgradeStep,
	mockConnect,
	mockStorePrivateKey,
	mockIsPasskeyPlatformAvailable,
	mockPickPasskeyProvider,
	mockOnDone,
	mockOnBack,
} = vi.hoisted(() => ({
	mockUpgradeAndLinkMutate: vi.fn(),
	mockUpgradeStep: { current: "idle" as string },
	mockConnect: vi.fn().mockResolvedValue(undefined),
	mockStorePrivateKey: vi.fn(),
	mockIsPasskeyPlatformAvailable: vi.fn(() => false),
	mockPickPasskeyProvider: vi.fn<() => PasskeyProvider>(() => "google"),
	mockOnDone: vi.fn(),
	mockOnBack: vi.fn(),
}));

const FAKE_PK =
	"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const FAKE_ADDRESS =
	"0xFakeAddress1234567890abcdef1234567890aaaa" as `0x${string}`;

vi.mock("viem/accounts", () => ({
	generatePrivateKey: () => FAKE_PK,
	privateKeyToAccount: () => ({ address: FAKE_ADDRESS }),
}));

vi.mock("#/features/onboarding/ui/paper-wallet-card", () => ({
	PaperWalletCard: ({ address }: { address: string }) => (
		<div data-testid="paper-wallet-card">{address}</div>
	),
}));

vi.mock("html-to-image", () => ({
	toPng: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
}));

vi.mock("#/connectors/privateKey", () => ({
	storePrivateKey: (pk: string) => mockStorePrivateKey(pk),
	clearPrivateKey: vi.fn(),
}));

vi.mock("wagmi/actions", () => ({
	connect: (...args: unknown[]) => mockConnect(...args),
}));

vi.mock("#/providers/web3-config", () => ({
	pkConnector: { id: "pk" },
	caliburConnector: { id: "calibur" },
	wagmiConfig: {},
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
	createRelayerClient: () => ({}),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-from-pk", () => ({
	useCaliburFromPk: () => ({
		step: mockUpgradeStep.current,
		error: null,
		upgradeAndLink: { mutate: mockUpgradeAndLinkMutate, isPending: false },
	}),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
	isPasskeyPlatformAvailable: () => mockIsPasskeyPlatformAvailable(),
	pickPasskeyProvider: () => mockPickPasskeyProvider(),
}));

vi.mock("#/lib/paper-wallet", () => ({
	buildPaperWalletUrl: (pk: string) => `https://app.example.com/?key=${pk}`,
	PAPER_WALLET_ORIGIN: "https://app.example.com",
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";
import { OnboardingWalletStep } from "./onboarding-wallet-step";

const PROFILE: ProfileInput = {
	name: "Alice",
	email: "alice@example.com",
	phone: "",
	location: {
		lat: -1.2921,
		lng: 36.8219,
		locationName: "Nairobi, Kenya",
		country: "KE",
	},
};

beforeEach(() => {
	mockUpgradeAndLinkMutate.mockClear();
	mockConnect.mockClear();
	mockStorePrivateKey.mockClear();
	mockOnDone.mockClear();
	mockOnBack.mockClear();
	mockConnect.mockResolvedValue(undefined);
	mockUpgradeStep.current = "idle";
	mockIsPasskeyPlatformAvailable.mockReturnValue(false);
	mockPickPasskeyProvider.mockReturnValue("google");
});

describe("OnboardingWalletStep rendering", () => {
	it("shows the paper wallet card with the generated address", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(screen.getByTestId("paper-wallet-card")).toBeTruthy();
		expect(screen.getByText(FAKE_ADDRESS)).toBeTruthy();
	});

	it("shows the download button", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
	});

	it("shows the acknowledgement checkbox", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(screen.getByRole("checkbox")).toBeTruthy();
	});

	it("hides Link button on non-passkey platforms", () => {
		mockIsPasskeyPlatformAvailable.mockReturnValue(false);
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(screen.queryByRole("button", { name: /link wallet/i })).toBeNull();
	});

	it("shows Link wallet to Google passkey button on Android Chrome", () => {
		mockIsPasskeyPlatformAvailable.mockReturnValue(true);
		mockPickPasskeyProvider.mockReturnValue("google");
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /link wallet to google passkey/i }),
		).toBeTruthy();
	});

	it("shows Link wallet to Apple ID passkey button on iOS Safari", () => {
		mockIsPasskeyPlatformAvailable.mockReturnValue(true);
		mockPickPasskeyProvider.mockReturnValue("apple");
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /link wallet to apple id passkey/i }),
		).toBeTruthy();
	});

	it("shows a disabled linked state after passkey linking succeeds", async () => {
		mockIsPasskeyPlatformAvailable.mockReturnValue(true);
		mockUpgradeStep.current = "done";
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);

		const linkedButton = screen.getByRole("button", {
			name: /passkey linked/i,
		});
		expect(linkedButton).toHaveProperty("disabled", true);
		await act(async () => {});
		expect(mockConnect).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ connector: { id: "calibur" } }),
		);
		expect(mockOnDone).toHaveBeenCalledTimes(1);
	});
});

describe("OnboardingWalletStep continue flow", () => {
	it("Continue button is disabled before acknowledging", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		expect(
			screen.getByRole("button", { name: /continue to wallet/i }),
		).toHaveProperty("disabled", true);
	});

	it("Continue button is enabled after checking the ack checkbox", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		expect(
			screen.getByRole("button", { name: /continue to wallet/i }),
		).toHaveProperty("disabled", false);
	});

	it("clicking Continue stores the key, connects with pkConnector, and calls onDone", async () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: /continue to wallet/i }),
			);
		});

		expect(mockStorePrivateKey).toHaveBeenCalledWith(FAKE_PK);
		expect(mockConnect).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ connector: { id: "pk" } }),
		);
		expect(mockOnDone).toHaveBeenCalledTimes(1);
	});
});

describe("OnboardingWalletStep link flow", () => {
	beforeEach(() => {
		mockIsPasskeyPlatformAvailable.mockReturnValue(true);
		mockPickPasskeyProvider.mockReturnValue("google");
	});

	it("disables passkey linking before acknowledging the saved key", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);

		expect(
			screen.getByRole("button", { name: /link wallet to google passkey/i }),
		).toHaveProperty("disabled", true);
	});

	it("clicking Link wallet to Google passkey after acknowledging calls upgradeAndLink.mutate", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		fireEvent.click(
			screen.getByRole("button", { name: /link wallet to google passkey/i }),
		);
		expect(mockUpgradeAndLinkMutate).toHaveBeenCalledTimes(1);
	});
});

describe("OnboardingWalletStep back navigation", () => {
	it("clicking back calls onBack", () => {
		render(
			<OnboardingWalletStep
				profileData={PROFILE}
				onBack={mockOnBack}
				onDone={mockOnDone}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /back/i }));
		expect(mockOnBack).toHaveBeenCalledTimes(1);
	});
});
