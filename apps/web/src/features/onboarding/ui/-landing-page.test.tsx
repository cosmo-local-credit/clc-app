import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";

vi.mock("#/components/install-app-link", () => ({
  InstallAppLink: () => <a href="/install">Install CLC</a>,
}));

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/components/language-selector", () => ({
  OnboardingMenu: () => <div data-testid="onboarding-menu" />,
}));

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: ({ sharp }: { sharp?: boolean }) => (
    <svg data-testid="clc-logo" data-sharp={sharp ? "true" : "false"} />
  ),
}));

import { LandingPage } from "./landing-page";

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("LandingPage", () => {
  it("links to About Cosmo-Local Credit at the end of the introduction", () => {
    render(<LandingPage />);

    const about = screen.getByRole("link", { name: "About Cosmo-Local Credit" });

    expect(about.getAttribute("href")).toBe(PLATFORM_ABOUT_URL);
    expect(about.getAttribute("target")).toBe("_blank");
    expect(about.getAttribute("rel")).toBe("noopener noreferrer");
    expect(about.closest("p")?.textContent).toBe(
      "Cosmo-Local Credit helps people and organizations support, share, and exchange goods and services. About Cosmo-Local Credit",
    );
  });

  it("shows branding, onboarding menu, and the two identity buttons", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /cosmo-local credit/i })).toBeTruthy();
    expect(screen.getByTestId("onboarding-menu")).toBeTruthy();
    expect(screen.getByTestId("clc-logo").getAttribute("data-sharp")).toBe("true");
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /i already have an account/i })).toBeTruthy();
    expect(screen.queryByTestId("sign-in-panel")).toBeNull();
  });

  it("navigates to the profile step when Create account is clicked", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "profile" },
    });
  });

  it("navigates to the signin step when I already have an account is clicked", () => {
    render(<LandingPage redirectTo="/wallet/send" />);
    fireEvent.click(screen.getByRole("button", { name: /i already have an account/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "signin", redirect: "/wallet/send" },
    });
  });
});
