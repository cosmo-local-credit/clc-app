import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockDisconnectAsync = vi.fn(() => Promise.resolve());
const mockClearAuthToken = vi.fn();

type MockAccountState = {
	isConnected: boolean;
	status: string;
	address?: `0x${string}`;
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mockNavigate,
}));

const mockUseAccount = vi.fn<() => MockAccountState>(() => ({
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

vi.mock("#/features/onboarding/ui/landing-page", () => ({
	LandingPage: () => <div data-testid="landing-page">Landing</div>,
}));

vi.mock("#/components/ui/clc-logo", () => ({
	CLCLogo: () => <svg data-testid="clc-logo" />,
}));

import { HomePage } from "#/components/home-page";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

function IndexPage() {
	const { isConnected } = mockUseAccount() as {
		isConnected: boolean;
		status: string;
		address?: `0x${string}`;
	};
	if (isConnected) return <HomePage />;
	return <LandingPage />;
}

beforeEach(() => {
	mockUseAccount.mockReturnValue({
		isConnected: false,
		status: "disconnected",
		address: undefined,
	});
	mockNavigate.mockClear();
	mockDisconnectAsync.mockClear();
	mockClearAuthToken.mockClear();
});

describe("IndexPage routing", () => {
	it("renders LandingPage when disconnected", () => {
		render(<IndexPage />);
		expect(screen.getByTestId("landing-page")).toBeTruthy();
	});

	it("renders HomePage when connected", () => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			status: "connected",
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});
		render(<IndexPage />);
		expect(screen.queryByTestId("landing-page")).toBeNull();
		expect(screen.getByText(/KSh 12,840/i)).toBeTruthy();
	});

	it("renders LandingPage while reconnecting without a connected account", () => {
		mockUseAccount.mockReturnValue({
			isConnected: false,
			status: "reconnecting",
			address: undefined,
		});
		render(<IndexPage />);
		expect(screen.getByTestId("landing-page")).toBeTruthy();
	});

	it("renders LandingPage while connecting without a connected account", () => {
		mockUseAccount.mockReturnValue({
			isConnected: false,
			status: "connecting",
			address: undefined,
		});
		render(<IndexPage />);
		expect(screen.getByTestId("landing-page")).toBeTruthy();
	});
});

describe("HomePage", () => {
	beforeEach(() => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			status: "connected",
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});
	});

	it("shows the connected address in settings", () => {
		render(<HomePage />);
		fireEvent.click(screen.getByRole("button", { name: /settings/i }));
		expect(
			screen.getByText(/0x1234567890abcdef1234567890abcdef12345678/i),
		).toBeTruthy();
	});

	it("clears auth state and disconnects from settings", async () => {
		render(<HomePage />);
		fireEvent.click(screen.getByRole("button", { name: /settings/i }));
		fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
		expect(mockClearAuthToken).toHaveBeenCalledTimes(1);
		expect(mockDisconnectAsync).toHaveBeenCalledTimes(1);
	});

	it("does not navigate when connected — routing is IndexPage's concern", () => {
		render(<HomePage />);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
