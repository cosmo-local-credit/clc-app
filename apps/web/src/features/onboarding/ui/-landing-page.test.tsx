import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";

const {
  mockNavigate,
  mockRecoverMutate,
  mockRecoveryState,
  mockConnectAction,
  mockBackendSigninMutateAsync,
  mockStorePrivateKey,
  mockDecryptPaperWalletPrivateKey,
  ENCRYPTED_KEY,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRecoverMutate: vi.fn(),
  mockConnectAction: vi.fn().mockResolvedValue(undefined),
  mockBackendSigninMutateAsync: vi.fn().mockResolvedValue({ userId: 1, role: "USER" }),
  mockStorePrivateKey: vi.fn(),
  mockDecryptPaperWalletPrivateKey: vi
    .fn()
    .mockResolvedValue("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  ENCRYPTED_KEY: "6PYMvQX3P2CjYXVkxczC5ZbPyyiDgRJTZatN6uQUFgYhBbm7idLvfZWzao",
  mockRecoveryState: {
    step: "idle" as string,
    outcome: null as string | null,
    error: null as string | null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: false }),
  useConnect: () => ({ connect: vi.fn() }),
}));

vi.mock("wagmi/actions", () => ({
  connect: (...args: unknown[]) => mockConnectAction(...args),
}));

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: ({
    onKeyDecoded,
    onCancel,
  }: {
    onKeyDecoded: (key: string) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="paper-wallet-scanner">
      <button
        type="button"
        onClick={() =>
          onKeyDecoded("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        }
      >
        Simulate scan
      </button>
      <button type="button" onClick={() => onKeyDecoded(ENCRYPTED_KEY)}>
        Simulate encrypted scan
      </button>
      <button type="button" onClick={onCancel}>
        Cancel scan
      </button>
    </div>
  ),
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
  createRelayerClient: () => ({}),
}));

vi.mock("#/features/auth/hooks/use-backend-auth", () => ({
  useBackendPrivateKeySignin: () => ({
    mutateAsync: mockBackendSigninMutateAsync,
    isPending: false,
  }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-recovery", () => ({
  useCaliburRecovery: () => ({
    ...mockRecoveryState,
    recover: { mutate: mockRecoverMutate },
  }),
}));

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

vi.mock("#/lib/paper-wallet-encryption", () => ({
  decryptPaperWalletPrivateKey: (...args: unknown[]) => mockDecryptPaperWalletPrivateKey(...args),
  isEncryptedPaperWalletPayload: (payload: string) => payload === ENCRYPTED_KEY,
}));

vi.mock("#/connectors/privateKey", () => ({
  storePrivateKey: (key: string) => mockStorePrivateKey(key),
  clearPrivateKey: vi.fn(),
}));

vi.mock("#/providers/web3-config", () => ({
  caliburConnector: { id: "calibur" },
  pkConnector: { id: "pk" },
  wagmiConfig: {},
}));

vi.mock("#/components/language-selector", () => ({
  OnboardingMenu: () => null,
  LanguageSelector: () => null,
}));

const mockIsPasskeyPlatformAvailable = vi.fn(() => false);
const mockPickPasskeyProvider = vi.fn<() => PasskeyProvider>(() => "google");

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  isPasskeyPlatformAvailable: () => mockIsPasskeyPlatformAvailable(),
  pickPasskeyProvider: () => mockPickPasskeyProvider(),
  usePlatformPasskeyLabel: () => ({
    available: mockIsPasskeyPlatformAvailable(),
    provider: mockPickPasskeyProvider(),
    label: mockPickPasskeyProvider() === "apple" ? "Apple ID" : "Google",
  }),
}));

import { BackendApiError } from "#/features/auth/api/client";

import { LandingPage } from "./landing-page";

beforeEach(() => {
  mockNavigate.mockClear();
  mockRecoverMutate.mockClear();
  mockConnectAction.mockClear();
  mockBackendSigninMutateAsync.mockClear();
  mockStorePrivateKey.mockClear();
  mockDecryptPaperWalletPrivateKey.mockClear();
  mockConnectAction.mockResolvedValue(undefined);
  mockBackendSigninMutateAsync.mockResolvedValue({ userId: 1, role: "USER" });
  mockDecryptPaperWalletPrivateKey.mockResolvedValue(
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  mockRecoveryState.step = "idle";
  mockRecoveryState.outcome = null;
  mockRecoveryState.error = null;
  mockIsPasskeyPlatformAvailable.mockReturnValue(false);
  mockPickPasskeyProvider.mockReturnValue("google");
});

describe("LandingPage button visibility", () => {
  it("always shows Create an account button", () => {
    render(<LandingPage />);
    expect(screen.getByRole("button", { name: /create an account/i })).toBeTruthy();
  });

  it("shows an icon in the Create an account button", () => {
    render(<LandingPage />);
    const button = screen.getByRole("button", { name: /create an account/i });
    expect(button.querySelector("svg")).toBeTruthy();
  });

  it("always shows Continue with Paper Wallet button", () => {
    render(<LandingPage />);
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toBeTruthy();
  });

  it("hides passkey button on non-passkey platforms", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(false);
    render(<LandingPage />);
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with apple/i })).toBeNull();
  });

  it("shows Continue with Google on Android Chrome", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("google");
    render(<LandingPage />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
  });

  it("shows Continue with Apple ID on iOS Safari", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("apple");
    render(<LandingPage />);
    expect(screen.getByRole("button", { name: /continue with apple id/i })).toBeTruthy();
  });

  it("does not show Apple ID button when provider is google", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("google");
    render(<LandingPage />);
    expect(screen.queryByRole("button", { name: /continue with apple/i })).toBeNull();
  });
});

describe("LandingPage navigation", () => {
  it("navigates to /onboarding when Create an account is clicked", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("opens the paper wallet scanner when Continue with Paper Wallet is clicked", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with paper wallet/i }));
    expect(screen.getByTestId("paper-wallet-scanner")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/signin" });
  });

  it("stores and connects a paper wallet key after scan", async () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with paper wallet/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /simulate scan/i }));
    });
    expect(mockBackendSigninMutateAsync).toHaveBeenCalledWith({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockStorePrivateKey).toHaveBeenCalledWith(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(mockConnectAction).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "pk" } }),
    );
  });

  it("unlocks and connects an encrypted paper wallet after scan", async () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with paper wallet/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /simulate encrypted scan/i }));
    });

    expect(await screen.findByText(/password-protected paper wallet/i)).toBeTruthy();
    expect(mockBackendSigninMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wallet passphrase" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /unlock and import/i }));
    });

    expect(mockDecryptPaperWalletPrivateKey).toHaveBeenCalledWith(
      ENCRYPTED_KEY,
      "wallet passphrase",
    );
    expect(mockBackendSigninMutateAsync).toHaveBeenCalledWith({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mockStorePrivateKey).toHaveBeenCalledWith(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("displays a backend error below the encrypted paper wallet card on failed sign-in", async () => {
    mockBackendSigninMutateAsync.mockRejectedValueOnce(
      new BackendApiError(403, "account is pending approval by a superadmin", "E10"),
    );
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with paper wallet/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /simulate encrypted scan/i }));
    });

    expect(await screen.findByText(/password-protected paper wallet/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wallet passphrase" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /unlock and import/i }));
    });

    expect(
      await screen.findByText(/E10: account is pending approval by a superadmin/i),
    ).toBeTruthy();
  });

  it("hides advanced options by default", () => {
    render(<LandingPage />);
    expect(screen.queryByRole("button", { name: /private key/i })).toBeNull();
  });

  it("shows Private key under advanced options", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
    expect(screen.getByRole("button", { name: /private key/i })).toBeTruthy();
  });
});

describe("LandingPage passkey recovery", () => {
  beforeEach(() => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("google");
  });

  it("calls recover.mutate when Google button is clicked", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(mockRecoverMutate).toHaveBeenCalledTimes(1);
  });

  it("shows not_found error message when outcome is not_found", () => {
    mockRecoveryState.outcome = "not_found";
    render(<LandingPage />);
    expect(screen.getByText(/no passkey found/i)).toBeTruthy();
  });

  it("shows Create an account CTA inside not_found error", () => {
    mockRecoveryState.outcome = "not_found";
    render(<LandingPage />);
    const createLink = screen
      .getAllByRole("link")
      .find((el) => el.getAttribute("href") === "/onboarding");
    expect(createLink).toBeTruthy();
  });

  it("shows recovery error message when recoveryError is set", () => {
    mockRecoveryState.error = "Verification failed";
    render(<LandingPage />);
    expect(screen.getByText(/verification failed/i)).toBeTruthy();
  });
});

describe("LandingPage private key form validation", () => {
  it("surfaces an inline error and does not connect when an invalid key is submitted", async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
    fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));

    const input = screen.getByLabelText(/^private key$/i);
    fireEvent.change(input, { target: { value: "not-a-valid-key" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in with private key/i }));
    });

    expect(screen.getByText(/valid private key or paper wallet/i)).toBeTruthy();
    expect(mockBackendSigninMutateAsync).not.toHaveBeenCalled();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockConnectAction).not.toHaveBeenCalled();
  });

  it("prompts for a password when an encrypted paper wallet is pasted into the field", async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
    fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));

    const input = screen.getByLabelText(/^private key$/i);
    fireEvent.change(input, { target: { value: ENCRYPTED_KEY } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in with private key/i }));
    });

    expect(await screen.findByText(/protected paper wallet/i)).toBeTruthy();
    expect(mockBackendSigninMutateAsync).not.toHaveBeenCalled();
  });
});
