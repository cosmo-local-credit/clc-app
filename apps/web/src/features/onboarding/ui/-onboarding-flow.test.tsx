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
const PHOTO = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });

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
  OnboardingProfileForm: ({
    page,
    onNext,
    onPage,
  }: {
    page: string;
    onNext: (data: ProfileInput, photo: File) => void;
    onPage: (page: "contact" | "location") => void;
  }) => {
    return (
      <div data-testid="profile-form" data-page={page}>
        <button type="button" onClick={() => onPage("contact")}>
          page-next
        </button>
        <button
          type="button"
          onClick={() => {
            mockOnboardingProfileFormOnNext();
            onNext(
              {
                name: "Alice",
                email: "alice@example.com",
                phone: "",
                preferredCurrency: "KES",
                bio: "",
                website: "",
                location: {
                  lat: -1.2921,
                  lng: 36.8219,
                  locationName: "Nairobi, Kenya",
                  country: "KE",
                },
              },
              PHOTO,
            );
          }}
        >
          profile-next
        </button>
      </div>
    );
  },
}));

vi.mock("./onboarding-wallet-step", () => ({
  OnboardingWalletStep: ({
    page,
    profileData,
    onDone,
    linkPasskey,
  }: {
    page: string;
    profileData: ProfileInput;
    onDone: () => void;
    linkPasskey: boolean;
  }) => {
    return (
      <div data-testid="wallet-step" data-page={page}>
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

  it("shows the same profile form on each of its three pages", () => {
    const { rerender } = render(<OnboardingFlow step="profile" />);
    const form = screen.getByTestId("profile-form");
    expect(form.getAttribute("data-page")).toBe("profile");
    rerender(<OnboardingFlow step="contact" />);
    expect(screen.getByTestId("profile-form")).toBe(form);
    expect(form.getAttribute("data-page")).toBe("contact");
    rerender(<OnboardingFlow step="location" />);
    expect(form.getAttribute("data-page")).toBe("location");
  });

  it("pushes the profile's next page so Back returns to the one before", () => {
    render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "page-next" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "contact" },
    });
  });

  it("navigates to card after profile when passkeys are unavailable", () => {
    render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "card" },
    });
  });

  it("goes straight to the paper wallet when passkeys are available too", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "card" },
    });
  });

  it("keeps one wallet step across protect, save and link", async () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    const { rerender } = render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    rerender(<OnboardingFlow step="card" />);
    const wallet = await screen.findByTestId("wallet-step");
    expect(wallet.getAttribute("data-page")).toBe("card");
    expect(screen.getByTestId("link-passkey").textContent).toBe("yes");
    rerender(<OnboardingFlow step="save" />);
    expect(screen.getByTestId("wallet-step")).toBe(wallet);
    expect(wallet.getAttribute("data-page")).toBe("save");
    rerender(<OnboardingFlow step="link" />);
    expect(wallet.getAttribute("data-page")).toBe("link");
  });

  it("sends Link back to Save where the platform cannot store a passkey", async () => {
    const { rerender } = render(<OnboardingFlow step="profile" />);
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    mockNavigate.mockClear();
    rerender(<OnboardingFlow step="link" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "save" },
      replace: true,
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
