import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/components/language-selector", () => ({
	LanguageSelector: () => <div data-testid="language-selector" />,
}));

const { SettingsPage } = await import("./settings-page");

describe("SettingsPage", () => {
	it("shows the connected address", () => {
		render(
			<SettingsPage
				address="0xabcdef1234567890abcdef1234567890abcdef12"
				isSigningOut={false}
				onSignOut={vi.fn()}
			/>,
		);
		expect(
			screen.getByText(/0xabcdef1234567890abcdef1234567890abcdef12/i),
		).toBeTruthy();
	});

	it("shows 'No address available' when address is undefined", () => {
		render(<SettingsPage isSigningOut={false} onSignOut={vi.fn()} />);
		expect(screen.getByText(/no address available/i)).toBeTruthy();
	});

	it("calls onSignOut when sign out button is clicked", () => {
		const onSignOut = vi.fn();
		render(<SettingsPage isSigningOut={false} onSignOut={onSignOut} />);
		fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
		expect(onSignOut).toHaveBeenCalledTimes(1);
	});

	it("disables the sign out button and shows 'Signing out...' while signing out", () => {
		render(<SettingsPage isSigningOut={true} onSignOut={vi.fn()} />);
		const button = screen.getByRole("button", { name: /signing out/i });
		expect(button).toBeTruthy();
		expect((button as HTMLButtonElement).disabled).toBe(true);
	});
});
