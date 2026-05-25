import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockNavigate } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("#/components/ui/country-select", () => ({
	CountrySelect: ({
		value,
		onChange,
		id,
	}: {
		value: string;
		onChange: (v: string) => void;
		id?: string;
	}) => (
		<input
			data-testid="country-select"
			id={id}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	),
}));

vi.mock("#/components/ui/phone-input", () => ({
	PhoneInputField: ({
		value,
		onChange,
		id,
	}: {
		value: string;
		onChange: (v: string) => void;
		id?: string;
	}) => (
		<input
			data-testid="phone-input"
			id={id}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			aria-label="Phone number"
		/>
	),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";
import { OnboardingProfileForm } from "./onboarding-profile-form";

beforeEach(() => {
	mockNavigate.mockClear();
});

describe("OnboardingProfileForm rendering", () => {
	it("renders name, email, phone, and country fields", () => {
		render(<OnboardingProfileForm onNext={vi.fn()} />);
		expect(screen.getByRole("textbox", { name: /name/i })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: /email/i })).toBeTruthy();
		expect(screen.getByTestId("phone-input")).toBeTruthy();
		expect(screen.getByTestId("country-select")).toBeTruthy();
	});

	it("renders the Continue submit button", () => {
		render(<OnboardingProfileForm onNext={vi.fn()} />);
		expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
	});

	it("has a sign in link pointing back to the landing page", () => {
		render(<OnboardingProfileForm onNext={vi.fn()} />);
		const link = screen
			.getAllByRole("link")
			.find((el) => el.getAttribute("href") === "/");
		expect(link).toBeTruthy();
	});

	it("shows the back button", () => {
		render(<OnboardingProfileForm onNext={vi.fn()} />);
		expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
	});
});

describe("OnboardingProfileForm navigation", () => {
	it("navigates to / when back button is clicked", () => {
		render(<OnboardingProfileForm onNext={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: /back/i }));
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
	});
});

describe("OnboardingProfileForm submission", () => {
	it("calls onNext with validated data on valid submission", async () => {
		const mockOnNext = vi.fn();
		render(<OnboardingProfileForm onNext={mockOnNext} />);

		fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
			target: { value: "Alice" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
			target: { value: "alice@example.com" },
		});
		fireEvent.change(screen.getByTestId("country-select"), {
			target: { value: "KE" },
		});

		await act(async () => {
			fireEvent.submit(screen.getByRole("form"));
		});

		expect(mockOnNext).toHaveBeenCalledWith(
			expect.objectContaining<Partial<ProfileInput>>({
				name: "Alice",
				email: "alice@example.com",
				country: "KE",
			}),
		);
	});

	it("does not call onNext when name is empty", async () => {
		const mockOnNext = vi.fn();
		render(<OnboardingProfileForm onNext={mockOnNext} />);

		fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
			target: { value: "alice@example.com" },
		});
		fireEvent.change(screen.getByTestId("country-select"), {
			target: { value: "KE" },
		});

		await act(async () => {
			fireEvent.submit(screen.getByRole("form"));
		});

		expect(mockOnNext).not.toHaveBeenCalled();
	});

	it("does not call onNext when both email and phone are empty", async () => {
		const mockOnNext = vi.fn();
		render(<OnboardingProfileForm onNext={mockOnNext} />);

		fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
			target: { value: "Alice" },
		});
		fireEvent.change(screen.getByTestId("country-select"), {
			target: { value: "KE" },
		});

		await act(async () => {
			fireEvent.submit(screen.getByRole("form"));
		});

		expect(mockOnNext).not.toHaveBeenCalled();
	});
});
