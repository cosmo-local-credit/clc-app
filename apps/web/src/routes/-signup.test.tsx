import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockNavigate, mockConnect, mockSignup, mockGetProfileCompleted } =
	vi.hoisted(() => ({
		mockNavigate: vi.fn(),
		mockConnect: vi.fn(),
		mockSignup: vi.fn(),
		mockGetProfileCompleted: vi.fn(() => false),
	}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mockNavigate,
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

const mockUseAccount = vi.fn(() => ({
	isConnected: false,
	address: undefined,
}));

vi.mock("wagmi", () => ({
	useAccount: () => mockUseAccount(),
	useConnect: () => ({ connect: mockConnect }),
}));

vi.mock("wagmi/actions", () => ({
	connect: mockConnect,
	getAccount: () => ({ isConnected: false }),
}));

vi.mock("#/connectors/privateKey", () => ({
	storePrivateKey: vi.fn(),
	clearPrivateKey: vi.fn(),
	privateKeyConnector: () => ({ id: "private-key" }),
	hasStoredPrivateKey: () => false,
}));

vi.mock("#/connectors/calibur-webauthn", () => ({
	caliburWebAuthnConnector: () => ({ id: "calibur-webauthn" }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-signup", () => ({
	useCaliburSignup: () => ({
		step: "idle",
		error: null,
		signup: { mutate: mockSignup },
	}),
}));

vi.mock("#/features/auth/hooks/use-siwe-auth", () => ({
	useSiweAuth: () => ({
		state: { status: "idle" },
		authenticate: vi.fn().mockResolvedValue("mock-token"),
	}),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-recovery", () => ({
	useCaliburRecovery: () => ({
		step: "idle",
		outcome: null,
		error: null,
		recover: { mutate: vi.fn() },
	}),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
	usePlatformPasskeyLabel: () => ({
		provider: "google",
		label: "Sign up with Google",
	}),
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
	createRelayerClient: () => ({}),
}));

vi.mock("#/features/signup/state/profile-completed", () => ({
	getProfileCompleted: () => mockGetProfileCompleted(),
	markProfileCompleted: vi.fn(),
	clearProfileCompleted: vi.fn(),
}));

vi.mock("#/lib/webauthn-storage", () => ({
	hasWebAuthnCredential: () => false,
	storeWebAuthnCredential: vi.fn(),
	clearWebAuthnCredential: vi.fn(),
}));

vi.mock("#/providers/web3", () => ({
	wagmiConfig: { state: {} },
}));

// ProfileForm renders Base UI Dialog (CountrySheet) which crashes in jsdom
vi.mock("#/features/signup/ui/profile-form", () => ({
	ProfileForm: ({
		address,
		onBack,
		onDone,
	}: {
		address: string;
		onBack: () => void;
		onDone: () => void;
	}) => (
		<div data-testid="profile-form">
			<span>Tell us about yourself ({address})</span>
			<button type="button" onClick={onBack}>
				Back
			</button>
			<button type="button" onClick={onDone}>
				Submit profile
			</button>
		</div>
	),
}));

// PaperWalletCreate uses html-to-image + qrcode which don't work in jsdom
vi.mock("#/features/signup/ui/paper-wallet-create", () => ({
	PaperWalletCreate: ({ onBack }: { onBack: () => void }) => (
		<div data-testid="paper-wallet-create">
			<button type="button" onClick={onBack}>
				Back
			</button>
		</div>
	),
}));

// ── Import under test ──────────────────────────────────────────────────────────

import { SignupFlow } from "#/features/signup/ui/signup-flow";

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
	mockUseAccount.mockReturnValue({ isConnected: false, address: undefined });
	mockNavigate.mockClear();
	mockConnect.mockClear();
	mockSignup.mockClear();
	mockGetProfileCompleted.mockReturnValue(false);
});

describe("SignupFlow", () => {
	describe("method picker (default phase)", () => {
		it("renders the passkey signup button", () => {
			render(<SignupFlow />);
			expect(
				screen.getByRole("button", { name: /continue with google/i }),
			).toBeTruthy();
		});

		it("renders the paper wallet button", () => {
			render(<SignupFlow />);
			expect(
				screen.getByRole("button", { name: /create paper wallet/i }),
			).toBeTruthy();
		});

		it("renders a sign-in link", () => {
			render(<SignupFlow />);
			expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
		});

		it("calls signup.mutate when the passkey button is clicked", () => {
			render(<SignupFlow />);
			fireEvent.click(
				screen.getByRole("button", { name: /continue with google/i }),
			);
			expect(mockSignup).toHaveBeenCalledTimes(1);
		});
	});

	describe("paper wallet phase", () => {
		it("switches to the paper wallet create screen when the button is clicked", () => {
			render(<SignupFlow />);
			fireEvent.click(
				screen.getByRole("button", { name: /create paper wallet/i }),
			);
			expect(screen.getByTestId("paper-wallet-create")).toBeTruthy();
		});

		it("hides the method picker while in paper wallet phase", () => {
			render(<SignupFlow />);
			fireEvent.click(
				screen.getByRole("button", { name: /create paper wallet/i }),
			);
			expect(
				screen.queryByRole("button", { name: /continue with google/i }),
			).toBeNull();
		});

		it("returns to the method picker when Back is clicked", () => {
			render(<SignupFlow />);
			fireEvent.click(
				screen.getByRole("button", { name: /create paper wallet/i }),
			);
			fireEvent.click(screen.getByRole("button", { name: /back/i }));
			expect(
				screen.getByRole("button", { name: /continue with google/i }),
			).toBeTruthy();
		});
	});

	describe("profile form phase (post-connection)", () => {
		it("shows the profile form when connected and profile not yet completed", () => {
			mockUseAccount.mockReturnValue({
				isConnected: true,
				address: "0xdeadbeef",
			});
			render(<SignupFlow />);
			expect(screen.getByText(/tell us about yourself/i)).toBeTruthy();
		});

		it("includes the wallet address in the profile form", () => {
			mockUseAccount.mockReturnValue({
				isConnected: true,
				address: "0xdeadbeef",
			});
			render(<SignupFlow />);
			expect(screen.getByText(/0xdeadbeef/i)).toBeTruthy();
		});

		it("navigates to / when profile is submitted", () => {
			mockUseAccount.mockReturnValue({
				isConnected: true,
				address: "0xdeadbeef",
			});
			render(<SignupFlow />);
			fireEvent.click(screen.getByRole("button", { name: /submit profile/i }));
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
		});

		it("navigates to / when back is clicked from the profile form", () => {
			mockUseAccount.mockReturnValue({
				isConnected: true,
				address: "0xdeadbeef",
			});
			render(<SignupFlow />);
			fireEvent.click(screen.getByRole("button", { name: /back/i }));
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
		});
	});

	describe("redirect when already done", () => {
		it("navigates to / when already connected and profile completed", () => {
			mockGetProfileCompleted.mockReturnValue(true);
			mockUseAccount.mockReturnValue({
				isConnected: true,
				address: "0xdeadbeef",
			});
			render(<SignupFlow />);
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
		});
	});
});
