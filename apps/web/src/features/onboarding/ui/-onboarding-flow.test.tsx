import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  mockOnboardingProfileFormOnNext,
  mockOnboardingWalletStepOnDone,
  mockNavigate,
  mockIsPasskeyPlatformAvailable,
  mockHistoryGo,
  mockHistoryFlush,
  mockHistorySubscribe,
} = vi.hoisted(() => ({
  mockOnboardingProfileFormOnNext: vi.fn(),
  mockOnboardingWalletStepOnDone: vi.fn(),
  mockNavigate: vi.fn(),
  mockIsPasskeyPlatformAvailable: vi.fn(() => false),
  mockHistoryGo: vi.fn(),
  mockHistoryFlush: vi.fn(),
  mockHistorySubscribe: vi.fn(() => () => {}),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useRouter: () => ({
    history: {
      location: { state: { __TSR_index: 0 }, pathname: "/onboarding", href: "/onboarding" },
      go: mockHistoryGo,
      flush: mockHistoryFlush,
      subscribe: mockHistorySubscribe,
    },
  }),
}));

vi.mock("#/lib/onboarding-exit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/onboarding-exit")>();
  return {
    ...actual,
    // Keep real exit for unit coverage of go/replace wiring via spy on history.
  };
});

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  isPasskeyPlatformAvailable: () => mockIsPasskeyPlatformAvailable(),
  pickPasskeyProvider: () => "google",
  usePlatformPasskeyLabel: () => ({ available: false, provider: "google", label: "Google" }),
}));

vi.mock("./onboarding-profile-form", () => ({
  OnboardingProfileForm: ({ onNext }: { onNext: (data: ProfileInput) => void }) => {
    return (
      <div data-testid="profile-form">
        <button
          type="button"
          onClick={() => {
            mockOnboardingProfileFormOnNext();
            onNext({
              name: "Alice",
              email: "alice@example.com",
              phone: "",
              location: {
                lat: -1.2921,
                lng: 36.8219,
                locationName: "Nairobi, Kenya",
                country: "KE",
              },
            });
          }}
        >
          profile-next
        </button>
      </div>
    );
  },
}));

vi.mock("./onboarding-method-step", () => ({
  OnboardingMethodStep: ({ onContinue }: { onContinue: (choice: "link" | "paper") => void }) => (
    <div data-testid="method-step">
      <button type="button" onClick={() => onContinue("link")}>
        method-continue
      </button>
    </div>
  ),
}));

vi.mock("./onboarding-wallet-step", () => ({
  OnboardingWalletStep: ({
    profileData,
    onDone,
    linkPasskey,
  }: {
    profileData: ProfileInput;
    onDone: () => void;
    linkPasskey: boolean;
  }) => {
    return (
      <div data-testid="wallet-step">
        <span data-testid="profile-name">{profileData.name}</span>
        <span data-testid="link-passkey">{linkPasskey ? "yes" : "no"}</span>
        <button
          type="button"
          onClick={() => {
            mockOnboardingWalletStepOnDone();
            onDone();
          }}
        >
          wallet-done
        </button>
      </div>
    );
  },
}));

import { OnboardingFlow } from "./onboarding-flow";

beforeEach(() => {
  mockOnboardingProfileFormOnNext.mockClear();
  mockOnboardingWalletStepOnDone.mockClear();
  mockNavigate.mockClear();
  mockIsPasskeyPlatformAvailable.mockReturnValue(false);
});

describe("OnboardingFlow step transitions", () => {
  it("renders the profile form on the profile step", () => {
    render(<OnboardingFlow step="profile" />);
    expect(screen.getByTestId("profile-form")).toBeTruthy();
    expect(screen.queryByTestId("wallet-step")).toBeNull();
  });

  it("navigates to card after profile when passkeys are unavailable", () => {
    render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "card" },
    });
  });

  it("navigates to method after profile when passkeys are available", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "method" },
    });
  });

  it("shows the wallet step with profile data on card after profile is set", async () => {
    const { rerender } = render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    rerender(<OnboardingFlow step="card" />);
    expect(await screen.findByTestId("wallet-step")).toBeTruthy();
    expect(screen.getByTestId("profile-name").textContent).toBe("Alice");
    expect(screen.getByTestId("link-passkey").textContent).toBe("no");
  });

  it("invokes onDone without navigating — route owns the authenticated exit", async () => {
    const { rerender } = render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    rerender(<OnboardingFlow step="card" />);
    mockNavigate.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "wallet-done" }));
    expect(mockOnboardingWalletStepOnDone).toHaveBeenCalledTimes(1);
    // finish() is intentionally a no-op for history; the onboarding route exits.
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/", replace: true }),
    );
  });

  it("redirects card without profile data back to profile with replace", () => {
    render(<OnboardingFlow step="card" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "profile" },
      replace: true,
    });
  });
});
