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
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "CLC" })).toBeTruthy();
    expect(screen.getByTestId("onboarding-menu")).toBeTruthy();
    expect(screen.getByTestId("sign-in-panel")).toBeTruthy();
  });

  it("navigates to onboarding when Create an account is clicked", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("lets the caller navigate after authentication", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /simulate authenticated/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
