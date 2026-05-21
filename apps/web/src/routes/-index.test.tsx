import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

const mockUseAccount = vi.fn(() => ({
	isConnected: false,
	address: undefined,
}));

vi.mock("wagmi", () => ({
	useAccount: () => mockUseAccount(),
}));

vi.mock("wagmi/actions", () => ({
	connect: vi.fn(),
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
	privateKeyConnector: () => ({ id: "private-key", name: "Private Key" }),
}));

vi.mock("#/providers/web3", () => ({
	wagmiConfig: { state: {} },
}));

vi.mock("#/features/webauthn/ui/signup-with-passkey", () => ({
	SignupWithPasskey: () => <div data-testid="signup-with-passkey" />,
}));

import { HomePage } from "#/components/home-page";

beforeEach(() => {
	mockUseAccount.mockReset();
	mockUseAccount.mockReturnValue({ isConnected: false, address: undefined });
});

describe("Home route", () => {
	it("shows the wallet access panel while disconnected", () => {
		render(<HomePage />);

		expect(
			screen.getByRole("button", { name: /connect wallet/i }),
		).toBeTruthy();
		expect(screen.queryByText(/wallet connected/i)).toBeNull();
	});

	it("shows the gated home card once connected", () => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});

		render(<HomePage />);

		expect(screen.getByText(/wallet connected/i)).toBeTruthy();
		expect(
			screen.getByText(/0x1234567890abcdef1234567890abcdef12345678/i),
		).toBeTruthy();
	});
});
