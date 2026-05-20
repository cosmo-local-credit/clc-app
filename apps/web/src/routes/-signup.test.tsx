import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockConnect,
	mockClearPrivateKey,
	mockNavigate,
	mockShowConnectModal,
	mockStorePrivateKey,
} = vi.hoisted(() => ({
	mockConnect: vi.fn(),
	mockClearPrivateKey: vi.fn(),
	mockNavigate: vi.fn(),
	mockShowConnectModal: vi.fn(),
	mockStorePrivateKey: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mockNavigate,
}));

const mockUseAccount = vi.fn(() => ({
	isConnected: false,
	address: undefined,
}));

vi.mock("wagmi", () => ({
	useAccount: () => mockUseAccount(),
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
		}) => children({ show: mockShowConnectModal }),
	},
}));

vi.mock("#/connectors/privateKey", () => ({
	storePrivateKey: mockStorePrivateKey,
	clearPrivateKey: mockClearPrivateKey,
	privateKeyConnector: () => ({ id: "private-key", name: "Private Key" }),
}));

const mockOnKeyDecoded = vi.fn();

vi.mock("#/components/paper-wallet-scanner", () => ({
	PaperWalletScanner: ({
		onKeyDecoded,
	}: {
		onKeyDecoded: (key: string) => void;
		onCancel: () => void;
	}) => {
		mockOnKeyDecoded.mockImplementation(onKeyDecoded);
		return <div data-testid="paper-wallet-scanner" />;
	},
}));

vi.mock("#/providers/web3", () => ({
	wagmiConfig: { state: {} },
}));

import { SignupPage } from "#/components/signup-page";

beforeEach(() => {
	mockUseAccount.mockReturnValue({ isConnected: false, address: undefined });
	mockNavigate.mockClear();
	mockShowConnectModal.mockClear();
	mockConnect.mockReset();
	mockStorePrivateKey.mockReset();
	mockClearPrivateKey.mockReset();
	mockOnKeyDecoded.mockReset();
});

describe("Signup page", () => {
	it("renders the Connect Wallet button", () => {
		render(<SignupPage />);
		expect(
			screen.getByRole("button", { name: /connect wallet/i }),
		).toBeTruthy();
	});

	it("opens the ConnectKit modal when Connect Wallet is clicked", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
		expect(mockShowConnectModal).toHaveBeenCalledTimes(1);
	});

	it("does not show the private key input initially", () => {
		render(<SignupPage />);
		expect(screen.queryByPlaceholderText("0x...")).toBeNull();
	});

	it("reveals the private key input when Private Key button is clicked", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
		expect(screen.getByPlaceholderText("0x...")).toBeTruthy();
	});

	it("validates the private key before connecting", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
		fireEvent.change(screen.getByLabelText(/^private key$/i), {
			target: { value: "0x123" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: /sign in with private key/i }),
		);

		expect(
			screen.getByText(
				/invalid private key\. must be 0x-prefixed 64-char hex\./i,
			),
		).toBeTruthy();
		expect(mockStorePrivateKey).not.toHaveBeenCalled();
		expect(mockConnect).not.toHaveBeenCalled();
	});

	it("stores the private key and connects with the private-key connector", async () => {
		mockConnect.mockResolvedValue(undefined);
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));

		const validKey =
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
		fireEvent.change(screen.getByLabelText(/^private key$/i), {
			target: { value: validKey },
		});

		const form = screen.getByLabelText(/^private key$/i).closest("form");
		expect(form).not.toBeNull();
		if (!form) {
			throw new Error("Private key form not found");
		}

		fireEvent.submit(form);

		expect(mockStorePrivateKey).toHaveBeenCalledWith(validKey);
		expect(mockConnect).toHaveBeenCalledWith(
			{ state: {} },
			{
				connector: { id: "private-key", name: "Private Key" },
			},
		);
	});

	it("redirects to / when already connected", () => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			address: "0x1234",
		});
		render(<SignupPage />);
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
	});

	it("renders the Paper Wallet button as the primary option", () => {
		render(<SignupPage />);
		expect(screen.getByRole("button", { name: /paper wallet/i })).toBeTruthy();
	});

	it("expands the paper wallet scanner when Paper Wallet is clicked", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));
		expect(screen.getByTestId("paper-wallet-scanner")).toBeTruthy();
	});

	it("hides other options when Paper Wallet is expanded", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));
		expect(
			screen.queryByRole("button", { name: /connect wallet/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /^private key$/i })).toBeNull();
	});

	it("connects with a valid key decoded from a QR scan", () => {
		mockConnect.mockResolvedValue(undefined);
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));

		const validKey =
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
		act(() => {
			mockOnKeyDecoded(validKey);
		});

		expect(mockStorePrivateKey).toHaveBeenCalledWith(validKey);
		expect(mockConnect).toHaveBeenCalledWith(
			{ state: {} },
			{ connector: { id: "private-key", name: "Private Key" } },
		);
	});

	it("shows an error when QR scan decodes an invalid key", () => {
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));

		act(() => {
			mockOnKeyDecoded("not-a-private-key");
		});

		expect(
			screen.getByText(/this qr code does not contain a valid private key/i),
		).toBeTruthy();
		expect(mockStorePrivateKey).not.toHaveBeenCalled();
	});

	it("connects with a bare hex key decoded from a QR scan", () => {
		mockConnect.mockResolvedValue(undefined);
		render(<SignupPage />);
		fireEvent.click(screen.getByRole("button", { name: /paper wallet/i }));

		const bareKey =
			"ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
		act(() => {
			mockOnKeyDecoded(bareKey);
		});

		expect(mockStorePrivateKey).toHaveBeenCalledWith(
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		);
	});
});
