import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";

vi.mock("#/providers/i18n", () => ({ useLocale: () => ({ loading: false, error: null }) }));
vi.mock("#/components/install-app-button", () => ({
  InstallAppButton: () => <button type="button">Install CLC</button>,
}));
// jsdom lays nothing out, so Embla has nothing to measure; the guide starts on slide one.
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), undefined] }));

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

  it("pins the two identity buttons under the guide, with Market and Install beside each other", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /cosmo-local credit/i })).toBeTruthy();
    expect(screen.getByTestId("onboarding-menu")).toBeTruthy();
    // The top bar's logo comes first; the guide's pictures draw it again.
    expect(screen.getAllByTestId("clc-logo")[0]?.getAttribute("data-sharp")).toBe("true");
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /i already have an account/i })).toBeTruthy();
    expect(screen.queryByTestId("sign-in-panel")).toBeNull();
    expect(screen.getByRole("heading", { name: "Your wallet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "How to use CLC" })).toBeNull();
    const footer = screen.getByRole("button", { name: /create account/i }).closest("footer");
    expect(footer?.textContent).toContain("Market");
    expect(footer?.textContent).toContain("Install CLC");
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

it("opens the public market and completes the welcome screen", () => {
  const onComplete = vi.fn();
  render(<LandingPage onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Market" }));
  expect(onComplete).toHaveBeenCalledOnce();
  expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
});
