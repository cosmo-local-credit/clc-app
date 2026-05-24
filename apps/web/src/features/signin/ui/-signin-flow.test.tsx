import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockNavigate, mockWagmiConnect, mockConnect, mockRecover } = vi.hoisted(
	() => ({
		mockNavigate: vi.fn(),
		mockWagmiConnect: vi.fn(),
		mockConnect: vi.fn().mockResolvedValue(undefined),
		mockRecover: vi.fn(),
	}),
);

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mockNavigate,
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

const mockUseAccount = vi.fn(() => ({ isConnected: false }));

vi.mock("wagmi", () => ({
	useAccount: () => mockUseAccount(),
	useConnect: () => ({ connect: mockWagmiConnect }),
}));

vi.mock("wagmi/actions", () => ({
	connect: mockConnect,
}));

vi.mock("connectkit", () => ({
	ConnectKitButton: {
		Custom: ({
			children,
		}: {
			children: (props: { show: () => void }) => React.ReactNode;
		}) => children({ show: vi.fn() }),
	},
}));

vi.mock("#/connectors/privateKey", () => ({
	storePrivateKey: vi.fn(),
	clearPrivateKey: vi.fn(),
	privateKeyConnector: () => ({ id: "private-key" }),
}));

vi.mock("#/connectors/calibur-webauthn", () => ({
	caliburWebAuthnConnector: () => ({ id: "calibur-webauthn" }),
}));

const mockRecoveryState = vi.fn(() => ({
	step: "idle",
	outcome: null,
	error: null,
	recover: { mutate: mockRecover },
}));

vi.mock("#/features/webauthn/hooks/use-calibur-recovery", () => ({
	useCaliburRecovery: () => mockRecoveryState(),
}));

vi.mock("#/features/auth/hooks/use-siwe-auth", () => ({
	useSiweAuth: () => ({
		state: { status: "idle" },
		authenticate: vi.fn().mockResolvedValue("mock-token"),
	}),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
	usePlatformPasskeyLabel: () => ({
		provider: "google",
		label: "Sign in with Google",
	}),
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
	createRelayerClient: () => ({}),
}));

vi.mock("#/providers/web3", () => ({
	wagmiConfig: {},
}));

// PaperWalletScanner has a camera dep that won't work in jsdom
vi.mock("#/components/paper-wallet-scanner", () => ({
	PaperWalletScanner: ({
		onKeyDecoded,
		onCancel,
	}: {
		onKeyDecoded: (k: string) => void;
		onCancel: () => void;
	}) => (
		<div data-testid="paper-wallet-scanner">
			<button type="button" onClick={() => onKeyDecoded("scanned-key")}>
				Simulate scan
			</button>
			<button type="button" onClick={onCancel}>
				Cancel scan
			</button>
		</div>
	),
}));

// ── Import under test ──────────────────────────────────────────────────────────

import { SigninFlow } from "./signin-flow";

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
	mockUseAccount.mockReturnValue({ isConnected: false });
	mockNavigate.mockClear();
	mockWagmiConnect.mockClear();
	mockConnect.mockClear();
	mockRecover.mockClear();
	mockRecoveryState.mockReturnValue({
		step: "idle",
		outcome: null,
		error: null,
		recover: { mutate: mockRecover },
	});
});

describe("SigninFlow", () => {
	describe("initial render", () => {
		it("renders the passkey button", () => {
			render(<SigninFlow />);
			expect(
				screen.getByRole("button", { name: /continue with google/i }),
			).toBeTruthy();
		});

		it("renders the paper wallet button", () => {
			render(<SigninFlow />);
			expect(
				screen.getByRole("button", { name: /paper wallet/i }),
			).toBeTruthy();
		});

		it("renders the connect wallet button", () => {
			render(<SigninFlow />);
			expect(
				screen.getByRole("button", { name: /connect wallet/i }),
			).toBeTruthy();
		});

		it("renders the private key button", () => {
			render(<SigninFlow />);
			expect(
				screen.getByRole("button", { name: /^private key$/i }),
			).toBeTruthy();
		});

		it("renders a sign-up link", () => {
			render(<SigninFlow />);
			expect(
				screen.getByRole("link", { name: /create a wallet/i }),
			).toBeTruthy();
		});

		it("does not show the scanner initially", () => {
			render(<SigninFlow />);
			expect(screen.queryByTestId("paper-wallet-scanner")).toBeNull();
		});
	});

	describe("passkey recovery", () => {
		it("calls recover.mutate when the passkey button is clicked", () => {
			render(<SigninFlow />);
			fireEvent.click(
				screen.getByRole("button", { name: /continue with google/i }),
			);
			expect(mockRecover).toHaveBeenCalledTimes(1);
		});

		it("shows a 'no wallet found' panel when outcome is not_found", () => {
			mockRecoveryState.mockReturnValue({
				step: "error",
				outcome: "not_found",
				error: null,
				recover: { mutate: mockRecover },
			});
			render(<SigninFlow />);
			expect(screen.getByText(/no wallet found/i)).toBeTruthy();
		});

		it("links to /signup from the not_found panel", () => {
			mockRecoveryState.mockReturnValue({
				step: "error",
				outcome: "not_found",
				error: null,
				recover: { mutate: mockRecover },
			});
			render(<SigninFlow />);
			expect(
				screen.getByRole("link", { name: /create a new wallet/i }),
			).toBeTruthy();
		});

		it("shows a retry button in the not_found panel", () => {
			mockRecoveryState.mockReturnValue({
				step: "error",
				outcome: "not_found",
				error: null,
				recover: { mutate: mockRecover },
			});
			render(<SigninFlow />);
			expect(
				screen.getByRole("button", { name: /try a different passkey/i }),
			).toBeTruthy();
		});

		it("shows the recovery error message when outcome is failed", () => {
			mockRecoveryState.mockReturnValue({
				step: "error",
				outcome: "failed",
				error: "Verification failed",
				recover: { mutate: mockRecover },
			});
			render(<SigninFlow />);
			expect(screen.getByText(/verification failed/i)).toBeTruthy();
		});
	});

	describe("paper wallet scan", () => {
		it("shows the scanner when Paper wallet button is clicked", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));
			expect(screen.getByTestId("paper-wallet-scanner")).toBeTruthy();
		});

		it("hides the other sign-in buttons when the scanner is open", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));
			expect(
				screen.queryByRole("button", { name: /continue with google/i }),
			).toBeNull();
			expect(
				screen.queryByRole("button", { name: /connect wallet/i }),
			).toBeNull();
		});

		it("cancelling the scanner brings back the main buttons", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));
			fireEvent.click(screen.getByRole("button", { name: /cancel scan/i }));
			expect(
				screen.getByRole("button", { name: /continue with google/i }),
			).toBeTruthy();
		});
	});

	describe("private key input", () => {
		it("reveals the private key input when Private key button is clicked", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
			expect(screen.getByPlaceholderText(/0x/i)).toBeTruthy();
		});

		it("validates the key before connecting", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
			fireEvent.change(screen.getByLabelText(/^private key$/i), {
				target: { value: "0xbad" },
			});
			fireEvent.click(
				screen.getByRole("button", { name: /sign in with private key/i }),
			);
			expect(screen.getByText(/invalid private key/i)).toBeTruthy();
			expect(mockConnect).not.toHaveBeenCalled();
		});

		it("hides the other buttons when the private key form is expanded", () => {
			render(<SigninFlow />);
			fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
			expect(
				screen.queryByRole("button", { name: /continue with google/i }),
			).toBeNull();
		});
	});

	describe("redirect", () => {
		it("navigates to / when the wallet connects", () => {
			mockUseAccount.mockReturnValue({ isConnected: true });
			render(<SigninFlow />);
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
		});
	});
});
