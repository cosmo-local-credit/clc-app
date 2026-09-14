import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";

const {
  mockUpgradeAndLinkMutate,
  mockUpgradeStep,
  mockBackendSignupMutateAsync,
  mockDelegateMutateAsync,
  mockDelegateStep,
  mockDelegateError,
  mockConnect,
  mockStorePrivateKey,
  mockIsPasskeyPlatformAvailable,
  mockPickPasskeyProvider,
  mockOnDone,
  mockOnBack,
  mockEncryptPaperWalletPrivateKey,
  mockFetchQuery,
  mockGetSession,
} = vi.hoisted(() => ({
  mockUpgradeAndLinkMutate: vi.fn(),
  mockUpgradeStep: { current: "idle" as string },
  mockBackendSignupMutateAsync: vi
    .fn()
    .mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" }),
  mockDelegateMutateAsync: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  mockDelegateStep: { current: "idle" as string },
  mockDelegateError: { current: null as string | null },
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockStorePrivateKey: vi.fn(),
  mockIsPasskeyPlatformAvailable: vi.fn(() => false),
  mockPickPasskeyProvider: vi.fn<() => PasskeyProvider>(() => "google"),
  mockOnDone: vi.fn(),
  mockOnBack: vi.fn(),
  mockEncryptPaperWalletPrivateKey: vi.fn().mockResolvedValue("6PYEncryptedPaperWallet"),
  mockFetchQuery: vi.fn(),
  mockGetSession: vi.fn(),
}));

const FAKE_PK =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const FAKE_ADDRESS = "0xFakeAddress1234567890abcdef1234567890aaaa" as `0x${string}`;

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    fetchQuery: (...args: unknown[]) => mockFetchQuery(...args),
  }),
}));

vi.mock("@clc/api/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clc/api/features/auth/client")>()),
  getSession: () => mockGetSession(),
}));

vi.mock("viem/accounts", () => ({
  generatePrivateKey: () => FAKE_PK,
  privateKeyToAccount: () => ({ address: FAKE_ADDRESS }),
}));

vi.mock("#/features/onboarding/ui/paper-wallet-card", () => ({
  PaperWalletCard: forwardRef<HTMLDivElement, { address: string }>(({ address }, ref) => (
    <div ref={ref} data-testid="paper-wallet-card">
      {address}
    </div>
  )),
}));

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
}));

const mockClearPrivateKey = vi.hoisted(() => vi.fn());

vi.mock("#/connectors/privateKey", () => ({
  storePrivateKey: (pk: string) => mockStorePrivateKey(pk),
  clearPrivateKey: () => mockClearPrivateKey(),
}));

vi.mock("wagmi/actions", () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

vi.mock("#/providers/web3-config", () => ({
  pkConnector: { id: "pk" },
  caliburConnector: { id: "calibur" },
  wagmiConfig: {},
}));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({}),
}));

vi.mock("#/features/auth/hooks/use-backend-auth", () => ({
  useBackendSignup: () => ({
    mutateAsync: mockBackendSignupMutateAsync,
    isPending: false,
    error: null,
  }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegate-from-pk", () => ({
  useCaliburDelegateFromPk: () => ({
    step: mockDelegateStep.current,
    error: mockDelegateError.current,
    mutateAsync: mockDelegateMutateAsync,
    isPending: false,
  }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-from-pk", () => ({
  useCaliburFromPk: () => ({
    step: mockUpgradeStep.current,
    error: null,
    upgradeAndLink: { mutate: mockUpgradeAndLinkMutate, isPending: false },
  }),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  isPasskeyPlatformAvailable: () => mockIsPasskeyPlatformAvailable(),
  pickPasskeyProvider: () => mockPickPasskeyProvider(),
}));

vi.mock("#/lib/paper-wallet", () => ({
  buildPaperWalletUrl: (pk: string) => `https://app.example.com/?key=${pk}`,
  PAPER_WALLET_ORIGIN: "https://app.example.com",
}));

vi.mock("@clc/core/features/wallet/paper-wallet-encryption", () => ({
  encryptPaperWalletPrivateKey: (...args: unknown[]) => mockEncryptPaperWalletPrivateKey(...args),
}));

vi.mock("#/components/wallet/wallet-layout", () => ({
  BackChevron: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick ?? mockOnBack}>
      {label}
    </button>
  ),
}));

vi.mock("#/components/ui/step-progress", () => ({
  StepProgress: () => <div data-testid="step-progress" />,
}));

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api/auth", async () => ({
  authClient: await import("@clc/api/features/auth/client"),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";
import { OnboardingWalletStep } from "./onboarding-wallet-step";

const PROFILE: ProfileInput = {
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
};

const STABLE_PK =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

function WalletStepFixture({ linkPasskey = false }: { linkPasskey?: boolean }) {
  return (
    <OnboardingWalletStep
      profileData={PROFILE}
      avatarFile={null}
      privateKey={STABLE_PK}
      backendRegistered={false}
      onBackendRegistered={vi.fn()}
      progressStep={linkPasskey ? 3 : 2}
      progressTotal={linkPasskey ? 3 : 2}
      linkPasskey={linkPasskey}
      onDone={mockOnDone}
    />
  );
}

function renderWalletStep(overrides: { linkPasskey?: boolean } = {}) {
  return render(<WalletStepFixture linkPasskey={overrides.linkPasskey} />);
}

async function acknowledgeSavedWallet() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /download card/i }));
  });
  fireEvent.click(screen.getByLabelText(/i have saved this key/i));
}

beforeEach(() => {
  mockUpgradeAndLinkMutate.mockClear();
  mockBackendSignupMutateAsync.mockReset();
  mockBackendSignupMutateAsync.mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" });
  mockDelegateMutateAsync.mockReset();
  mockDelegateMutateAsync.mockResolvedValue({ result: { trackingId: "tracking-1" } });
  mockDelegateStep.current = "idle";
  mockDelegateError.current = null;
  mockConnect.mockClear();
  mockStorePrivateKey.mockClear();
  mockClearPrivateKey.mockClear();
  mockOnDone.mockClear();
  mockOnBack.mockClear();
  mockEncryptPaperWalletPrivateKey.mockClear();
  mockEncryptPaperWalletPrivateKey.mockResolvedValue("6PYEncryptedPaperWallet");
  mockConnect.mockResolvedValue(undefined);
  mockUpgradeStep.current = "idle";
  mockIsPasskeyPlatformAvailable.mockReturnValue(false);
  mockPickPasskeyProvider.mockReturnValue("google");
  mockFetchQuery.mockReset();
  mockFetchQuery.mockImplementation(async (opts: { queryFn?: () => unknown }) => {
    if (opts?.queryFn) return opts.queryFn();
    return mockGetSession();
  });
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ address: FAKE_ADDRESS, chainId: 42220 });
});

describe("OnboardingWalletStep rendering", () => {
  it("shows the paper wallet card with the generated address", () => {
    renderWalletStep();
    expect(screen.getByTestId("paper-wallet-card")).toBeTruthy();
    expect(screen.getByText(FAKE_ADDRESS)).toBeTruthy();
  });

  it("shows the download button", () => {
    renderWalletStep();
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("shows the acknowledgement checkbox", () => {
    renderWalletStep();
    expect(screen.getByLabelText(/i have saved this key/i)).toBeTruthy();
  });

  it("hides Link button when linkPasskey is false", () => {
    renderWalletStep({ linkPasskey: false });
    expect(screen.queryByRole("button", { name: /link wallet/i })).toBeNull();
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toBeTruthy();
  });

  it("shows Link and paper continue when linkPasskey is true", () => {
    mockPickPasskeyProvider.mockReturnValue("google");
    renderWalletStep({ linkPasskey: true });
    expect(screen.getByRole("button", { name: /link wallet to google/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toBeTruthy();
  });

  it("shows Link wallet to Apple ID button when linking Apple", () => {
    mockPickPasskeyProvider.mockReturnValue("apple");
    renderWalletStep({ linkPasskey: true });
    expect(screen.getByRole("button", { name: /link wallet to apple id/i })).toBeTruthy();
  });

  it("connects Calibur and finishes after passkey linking succeeds", async () => {
    mockPickPasskeyProvider.mockReturnValue("google");
    mockUpgradeStep.current = "done";
    renderWalletStep({ linkPasskey: true });

    // While Calibur connects, paper continue stays disabled.
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => {});
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "calibur" } }),
    );
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });

  it("on Calibur connect failure: paper continues and Link retries connect only", async () => {
    mockPickPasskeyProvider.mockReturnValue("google");
    mockUpgradeStep.current = "done";
    // Persistent reject — React Strict Mode double-mount would consume a single Once.
    mockConnect.mockRejectedValue(new Error("calibur failed"));
    renderWalletStep({ linkPasskey: true });

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalled();
    });
    await waitFor(() => {
      // Production surfaces err.message when present.
      expect(screen.getByText(/calibur failed/i)).toBeTruthy();
    });

    // Paper path available after connector failure.
    await acknowledgeSavedWallet();
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toHaveProperty(
      "disabled",
      false,
    );

    mockConnect.mockClear();
    mockConnect.mockResolvedValue(undefined);
    mockUpgradeAndLinkMutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /retry google connection/i }));
    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ connector: { id: "calibur" } }),
      );
    });
    // Must not re-run passkey registration.
    expect(mockUpgradeAndLinkMutate).not.toHaveBeenCalled();
  });

  it("on session verification failure: allows retry and does not latch finish", async () => {
    mockPickPasskeyProvider.mockReturnValue("google");
    mockUpgradeStep.current = "done";
    mockGetSession.mockResolvedValue(null);
    renderWalletStep({ linkPasskey: true });

    await waitFor(() => {
      expect(screen.getByText(/session could not be verified/i)).toBeTruthy();
    });
    expect(mockOnDone).not.toHaveBeenCalled();

    await acknowledgeSavedWallet();
    expect(screen.getByRole("button", { name: /continue with paper wallet/i })).toHaveProperty(
      "disabled",
      false,
    );

    mockGetSession.mockResolvedValue({ address: FAKE_ADDRESS, chainId: 42220 });
    const connectCallsAfterFail = mockConnect.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /retry google connection/i }));
    await waitFor(() => {
      expect(mockOnDone).toHaveBeenCalled();
    });
    // Session-only recovery: must not call connect again after connector succeeded.
    expect(mockConnect.mock.calls.length).toBe(connectCallsAfterFail);
  });

  it("paper path: session failure after connect does not clear the key and retries session only", async () => {
    mockGetSession.mockResolvedValueOnce(null).mockResolvedValue({
      address: FAKE_ADDRESS,
      chainId: 42220,
    });
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await acknowledgeSavedWallet();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });

    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();

    mockDelegateStep.current = "done";
    rerender(<WalletStepFixture />);

    await waitFor(() => {
      expect(screen.getByText(/session could not be verified/i)).toBeTruthy();
    });
    expect(mockStorePrivateKey).toHaveBeenCalled();
    // Key must not be cleared after a successful connector + failed session.
    expect(mockClearPrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();

    const connectCalls = mockConnect.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });
    await waitFor(() => {
      expect(mockOnDone).toHaveBeenCalled();
    });
    expect(mockConnect.mock.calls.length).toBe(connectCalls);
  });
});

describe("OnboardingWalletStep continue flow", () => {
  it("Continue button is disabled before acknowledging", () => {
    renderWalletStep({ linkPasskey: false });
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("requires a paper-wallet download before the acknowledgement unlocks Continue", async () => {
    renderWalletStep({ linkPasskey: false });
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    await acknowledgeSavedWallet();
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("requires applying QR protection before continuing when protection is enabled", async () => {
    renderWalletStep({ linkPasskey: false });
    await acknowledgeSavedWallet();
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.click(screen.getByLabelText(/protect paper wallet with a password/i));
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wallet passphrase" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "wallet passphrase" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^protect paper wallet$/i }));
    });

    expect(mockEncryptPaperWalletPrivateKey).toHaveBeenCalledWith(STABLE_PK, "wallet passphrase");
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );

    await acknowledgeSavedWallet();
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("shows a pending view and opens the wallet only after smart-wallet activation confirms", async () => {
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await acknowledgeSavedWallet();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });

    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: STABLE_PK,
      // No photo was chosen on the profile step, so signup has nothing to upload.
      avatarFile: null,
    });
    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: STABLE_PK });
    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue to wallet/i })).toBeNull();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();

    mockDelegateStep.current = "done";
    rerender(<WalletStepFixture />);

    await waitFor(() => {
      expect(mockOnDone).toHaveBeenCalledTimes(1);
    });
    expect(mockStorePrivateKey).toHaveBeenCalledWith(STABLE_PK);
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "pk" } }),
    );
  });

  it("returns to the wallet step when smart-wallet activation fails", async () => {
    mockDelegateMutateAsync.mockRejectedValue(new Error("delegate failed"));
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await acknowledgeSavedWallet();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });

    mockDelegateStep.current = "error";
    mockDelegateError.current = "delegate failed";
    rerender(<WalletStepFixture />);

    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: STABLE_PK });
    expect(screen.getByText("delegate failed")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toBeTruthy();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();
  });

  it("does NOT call storePrivateKey when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    renderWalletStep({ linkPasskey: false });
    await acknowledgeSavedWallet();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });
    expect(mockDelegateMutateAsync).not.toHaveBeenCalled();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();
  });
});

describe("OnboardingWalletStep link flow", () => {
  beforeEach(() => {
    mockPickPasskeyProvider.mockReturnValue("google");
  });

  it("disables passkey linking before acknowledging the saved key", () => {
    renderWalletStep({ linkPasskey: true });

    expect(screen.getByRole("button", { name: /link wallet to google/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("clicking Link wallet to Google after acknowledging calls upgradeAndLink.mutate", async () => {
    renderWalletStep({ linkPasskey: true });
    await acknowledgeSavedWallet();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /link wallet to google/i }));
    });
    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: STABLE_PK,
      // No photo was chosen on the profile step, so signup has nothing to upload.
      avatarFile: null,
    });
    expect(mockUpgradeAndLinkMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /link wallet to google/i })).toBeNull();
  });

  it("does NOT call upgradeAndLink when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    renderWalletStep({ linkPasskey: true });
    await acknowledgeSavedWallet();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /link wallet to google/i }));
    });
    expect(mockUpgradeAndLinkMutate).not.toHaveBeenCalled();
  });
});

describe("OnboardingWalletStep back navigation", () => {
  it("renders a back control", () => {
    renderWalletStep({ linkPasskey: false });
    expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
  });
});
