import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockDisconnectAsync = vi.fn(() => Promise.resolve());
const mockClearAuthToken = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mockNavigate,
}));

const mockUseAccount = vi.fn(() => ({
	isConnected: false,
	status: "disconnected",
	address: undefined,
}));

vi.mock("wagmi", () => ({
	useAccount: () => mockUseAccount(),
	useDisconnect: () => ({ disconnectAsync: mockDisconnectAsync }),
}));

vi.mock("#/features/auth/state/token", () => ({
	clearAuthToken: () => mockClearAuthToken(),
}));

vi.mock("#/lib/webauthn-storage", () => ({
	hasWebAuthnCredential: () => false,
}));

import { HomePage } from "#/components/home-page";

beforeEach(() => {
	mockUseAccount.mockReset();
	mockUseAccount.mockReturnValue({
		isConnected: false,
		status: "disconnected",
		address: undefined,
	});
	mockNavigate.mockClear();
	mockDisconnectAsync.mockClear();
	mockClearAuthToken.mockClear();
});

describe("Home route", () => {
	it("navigates to /signup when disconnected (status=disconnected) and no webauthn credential", () => {
		render(<HomePage />);
		// useEffect fires after render; navigate called with /signup
		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/signup",
			replace: true,
		});
	});

	it("does not redirect while wallet is reconnecting", () => {
		mockUseAccount.mockReturnValue({
			isConnected: false,
			status: "reconnecting",
			address: undefined,
		});
		render(<HomePage />);
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("shows the gated home card once connected", () => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			status: "connected",
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});

		render(<HomePage />);

		expect(screen.getByText(/wallet connected/i)).toBeTruthy();
		expect(
			screen.getByText(/0x1234567890abcdef1234567890abcdef12345678/i),
		).toBeTruthy();
	});

	it("clears auth state and disconnects when signing out", async () => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			status: "connected",
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});

		render(<HomePage />);

		fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

		expect(mockClearAuthToken).toHaveBeenCalledTimes(1);
		expect(mockDisconnectAsync).toHaveBeenCalledTimes(1);
	});
});
