import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

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

// ── IndexPage — thin routing shell (mirrors routes/index.tsx) ──────────────────

function IndexPage() {
	const { isConnected, status } = mockUseAccount() as {
		isConnected: boolean;
		status: string;
		address?: `0x${string}`;
	};
	if (status === "connecting" || status === "reconnecting") return null;
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

// ── IndexPage routing ──────────────────────────────────────────────────────────

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
		expect(screen.getByText(/wallet connected/i)).toBeTruthy();
	});

	it("renders nothing while reconnecting", () => {
		mockUseAccount.mockReturnValue({
			isConnected: false,
			status: "reconnecting",
			address: undefined,
		});
		const { container } = render(<IndexPage />);
		expect(container.firstChild).toBeNull();
	});

	it("renders nothing while connecting", () => {
		mockUseAccount.mockReturnValue({
			isConnected: false,
			status: "connecting",
			address: undefined,
		});
		const { container } = render(<IndexPage />);
		expect(container.firstChild).toBeNull();
	});
});

// ── HomePage (connected state) ─────────────────────────────────────────────────

describe("HomePage", () => {
	beforeEach(() => {
		mockUseAccount.mockReturnValue({
			isConnected: true,
			status: "connected",
			address: "0x1234567890abcdef1234567890abcdef12345678",
		});
	});

	it("shows the connected address", () => {
		render(<HomePage />);
		expect(
			screen.getByText(/0x1234567890abcdef1234567890abcdef12345678/i),
		).toBeTruthy();
	});

	it("clears auth state and disconnects when signing out", async () => {
		render(<HomePage />);
		fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
		expect(mockClearAuthToken).toHaveBeenCalledTimes(1);
		expect(mockDisconnectAsync).toHaveBeenCalledTimes(1);
	});

	it("does not navigate when connected — routing is IndexPage's concern", () => {
		render(<HomePage />);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
