import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/components/auth/sign-in-panel", () => ({
  SignInPanel: ({ onAuthenticated }: { onAuthenticated: () => void }) => (
    <div data-testid="sign-in-panel">
      <button type="button" onClick={onAuthenticated}>
        Simulate authenticated
      </button>
    </div>
  ),
}));

vi.mock("#/components/language-selector", () => ({
  OnboardingMenu: () => <div data-testid="onboarding-menu" />,
}));

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

import { LandingPage } from "./landing-page";

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("LandingPage", () => {
  it("shows branding, onboarding menu, and shared sign-in panel", () => {
    render(<LandingPage onCreateAccount={() => {}} />);
    expect(screen.getByRole("heading", { name: "CLC" })).toBeTruthy();
    expect(screen.getByTestId("onboarding-menu")).toBeTruthy();
    expect(screen.getByTestId("sign-in-panel")).toBeTruthy();
  });

  it("invokes onCreateAccount when Create an account is clicked", () => {
    const onCreateAccount = vi.fn();
    render(<LandingPage onCreateAccount={onCreateAccount} />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
  });

  it("navigates to the redirect target after authentication", () => {
    render(<LandingPage onCreateAccount={() => {}} redirectTo="/wallet/send" />);
    fireEvent.click(screen.getByRole("button", { name: /simulate authenticated/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/wallet/send", replace: true });
  });

  it("falls back to home after authentication when no redirect", () => {
    render(<LandingPage onCreateAccount={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /simulate authenticated/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
