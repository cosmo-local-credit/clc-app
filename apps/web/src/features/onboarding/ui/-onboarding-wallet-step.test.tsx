import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";

const {
  mockUpgradeAndLinkMutate,
  mockUpgradeStep,
  mockBackendSignupMutateAsync,
  mockBackendSignupError,
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
  mockExportPaperWallet,
  mockFetchQuery,
  mockGetSession,
} = vi.hoisted(() => ({
  mockUpgradeAndLinkMutate: vi.fn(),
  mockUpgradeStep: { current: "idle" as string },
  mockBackendSignupMutateAsync: vi
    .fn()
    .mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" }),
  mockBackendSignupError: { current: null as unknown },
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
  mockExportPaperWallet: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
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

vi.mock("#/features/onboarding/ui/paper-wallet-export", () => ({
  exportPaperWallet: (...args: unknown[]) => mockExportPaperWallet(...args),
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
    error: mockBackendSignupError.current,
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

import { BackendApiError } from "@clc/api/client/errors";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import type { WalletPage } from "#/lib/onboarding-search";
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
const PHOTO = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });

/** Plays the flow's part: the page lives in state, as the URL step would. */
function WalletStepFixture({
  linkPasskey = false,
  startPage = "card",
}: {
  linkPasskey?: boolean;
  startPage?: WalletPage;
}) {
  const [page, setPage] = useState<WalletPage>(startPage);
  return (
    <>
      <span data-testid="page">{page}</span>
      <OnboardingWalletStep
        page={page}
        onPage={setPage}
        onReplace={setPage}
        profileData={PROFILE}
        avatarFile={PHOTO}
        privateKey={STABLE_PK}
        backendRegistered={false}
        onBackendRegistered={vi.fn()}
        progressTotal={linkPasskey ? 6 : 5}
        linkPasskey={linkPasskey}
        onDone={mockOnDone}
      />
    </>
  );
}

function renderWalletStep(overrides: { linkPasskey?: boolean; startPage?: WalletPage } = {}) {
  return render(
    <WalletStepFixture linkPasskey={overrides.linkPasskey} startPage={overrides.startPage} />,
  );
}

const page = () => screen.getByTestId("page").textContent;
const button = (name: RegExp) => screen.getByRole("button", { name });
const passwordSwitch = () =>
  screen.getByRole("switch", { name: /protect paper wallet with a password/i });
const savedKey = () => screen.getByRole("checkbox", { name: /i have saved this key/i });

/** Your paper wallet: turn the password off and move on to Save your card. */
function skipPassword() {
  fireEvent.click(passwordSwitch());
  fireEvent.click(button(/^continue$/i));
}

async function savePaperWallet() {
  skipPassword();
  await act(async () => {
    fireEvent.click(button(/download card/i));
  });
  fireEvent.click(savedKey());
}

function acceptPlatformTerms() {
  const terms = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
  if (!terms.hasAttribute("data-checked")) fireEvent.click(terms);
}

/** Every page done up to the last button: Continue to wallet, or Link's two. */
async function completeWalletRequirements({ linkPasskey = false } = {}) {
  await savePaperWallet();
  if (linkPasskey) fireEvent.click(button(/^continue$/i));
  acceptPlatformTerms();
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn().mockReturnValue("blob:paper-wallet"),
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  mockExportPaperWallet.mockClear();
  mockExportPaperWallet.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  mockUpgradeAndLinkMutate.mockClear();
  mockBackendSignupMutateAsync.mockReset();
  mockBackendSignupMutateAsync.mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" });
  mockBackendSignupError.current = null;
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

describe("OnboardingWalletStep pages", () => {
  it("starts on Your paper wallet with the password on and nothing to download yet", () => {
    renderWalletStep();
    expect(screen.getByRole("heading", { name: "Your paper wallet" })).toBeTruthy();
    expect(passwordSwitch().getAttribute("aria-checked")).toBe("true");
    expect(button(/^protect paper wallet$/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /download card/i })).toBeNull();
  });

  it("shows the card, Download and the acknowledgement on Save your card", () => {
    renderWalletStep();
    skipPassword();
    expect(page()).toBe("save");
    expect(screen.getByTestId("paper-wallet-card")).toBeTruthy();
    expect(screen.getByText(FAKE_ADDRESS)).toBeTruthy();
    expect(button(/download card/i)).toBeTruthy();
    expect(savedKey()).toBeTruthy();
  });

  it("customizes the card from a sheet over the preview", async () => {
    renderWalletStep();
    skipPassword();
    fireEvent.click(button(/customize/i));
    const sheet = await screen.findByRole("dialog", { name: "Customize" });
    expect(sheet.textContent).toContain("Name on wallet");
    expect(screen.getByLabelText("Name on wallet")).toHaveProperty("value", "Alice");
  });

  it("finishes on Save, with the terms, where no passkey can be linked", () => {
    renderWalletStep({ linkPasskey: false });
    skipPassword();
    expect(screen.queryByRole("button", { name: /link wallet/i })).toBeNull();
    expect(button(/continue to wallet/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Accept Terms and Conditions" })).toBeTruthy();
  });

  it("offers Link and the paper wallet on the last page where a passkey can be linked", async () => {
    mockPickPasskeyProvider.mockReturnValue("google");
    renderWalletStep({ linkPasskey: true });
    await savePaperWallet();
    expect(screen.queryByRole("checkbox", { name: "Accept Terms and Conditions" })).toBeNull();
    fireEvent.click(button(/^continue$/i));
    expect(page()).toBe("link");
    expect(screen.getByRole("heading", { name: "Link Google?" })).toBeTruthy();
    expect(button(/link wallet to google/i)).toBeTruthy();
    expect(button(/continue with paper wallet/i)).toBeTruthy();
  });

  it("shows Link wallet to Apple ID button when linking Apple", async () => {
    mockPickPasskeyProvider.mockReturnValue("apple");
    renderWalletStep({ linkPasskey: true });
    await completeWalletRequirements({ linkPasskey: true });
    expect(button(/link wallet to apple id/i)).toBeTruthy();
  });

  it("sends a page reached early back to the one it needs", () => {
    const { unmount } = renderWalletStep({ startPage: "save" });
    expect(page()).toBe("card");
    unmount();
    renderWalletStep({ linkPasskey: true, startPage: "link" });
    expect(page()).toBe("card");
  });

  it("does not open Link until the card is saved and acknowledged", async () => {
    renderWalletStep({ linkPasskey: true });
    skipPassword();
    expect(button(/^continue$/i)).toHaveProperty("disabled", true);
    await act(async () => {
      fireEvent.click(button(/download card/i));
    });
    expect(button(/^continue$/i)).toHaveProperty("disabled", true);
    fireEvent.click(savedKey());
    expect(button(/^continue$/i)).toHaveProperty("disabled", false);
  });
});

describe("OnboardingWalletStep passkey connection", () => {
  beforeEach(() => {
    mockPickPasskeyProvider.mockReturnValue("google");
  });

  it("connects Calibur and finishes after passkey linking succeeds", async () => {
    mockUpgradeStep.current = "done";
    renderWalletStep({ linkPasskey: true });
    await completeWalletRequirements({ linkPasskey: true });

    // While Calibur connects, paper continue stays disabled.
    expect(button(/continue with paper wallet/i)).toHaveProperty("disabled", true);
    await act(async () => {});
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "calibur" } }),
    );
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });

  it("on Calibur connect failure: paper continues and Link retries connect only", async () => {
    mockUpgradeStep.current = "done";
    // Persistent reject — React Strict Mode double-mount would consume a single Once.
    mockConnect.mockRejectedValue(new Error("calibur failed"));
    renderWalletStep({ linkPasskey: true });
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());

    await completeWalletRequirements({ linkPasskey: true });
    // Production surfaces err.message when present.
    await waitFor(() => expect(screen.getByText(/calibur failed/i)).toBeTruthy());
    expect(button(/continue with paper wallet/i)).toHaveProperty("disabled", false);

    mockConnect.mockClear();
    mockConnect.mockResolvedValue(undefined);
    mockUpgradeAndLinkMutate.mockClear();
    fireEvent.click(button(/retry google connection/i));
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
    mockUpgradeStep.current = "done";
    mockGetSession.mockResolvedValue(null);
    renderWalletStep({ linkPasskey: true });
    await completeWalletRequirements({ linkPasskey: true });

    await waitFor(() => expect(screen.getByText(/session could not be verified/i)).toBeTruthy());
    expect(mockOnDone).not.toHaveBeenCalled();
    expect(button(/continue with paper wallet/i)).toHaveProperty("disabled", false);

    mockGetSession.mockResolvedValue({ address: FAKE_ADDRESS, chainId: 42220 });
    const connectCallsAfterFail = mockConnect.mock.calls.length;
    fireEvent.click(button(/retry google connection/i));
    await waitFor(() => expect(mockOnDone).toHaveBeenCalled());
    // Session-only recovery: must not call connect again after connector succeeded.
    expect(mockConnect.mock.calls.length).toBe(connectCallsAfterFail);
  });
});

describe("OnboardingWalletStep continue flow", () => {
  it("asks for the password before moving on, and lets it be turned off", () => {
    renderWalletStep({ linkPasskey: false });
    expect(screen.queryByRole("button", { name: /^continue$/i })).toBeNull();
    fireEvent.click(passwordSwitch());
    expect(passwordSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("QR currently contains the raw private key.")).toBeTruthy();
    expect(button(/^continue$/i)).toBeTruthy();
  });

  it("applies the password, then moves on to a protected card", async () => {
    renderWalletStep({ linkPasskey: false });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wallet passphrase" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "wallet passphrase" },
    });
    await act(async () => {
      fireEvent.click(button(/^protect paper wallet$/i));
    });

    expect(mockEncryptPaperWalletPrivateKey).toHaveBeenCalledWith(STABLE_PK, "wallet passphrase");
    expect(
      screen.getByText("Paper wallet is protected. Keep the password separate from the card."),
    ).toBeTruthy();
    fireEvent.click(button(/^continue$/i));
    expect(page()).toBe("save");
    expect(button(/download card/i)).toHaveProperty("disabled", false);
  });

  it("keeps Continue to wallet disabled before acknowledging", () => {
    renderWalletStep({ linkPasskey: false });
    skipPassword();
    expect(button(/continue to wallet/i)).toHaveProperty("disabled", true);
  });

  it("requires a paper-wallet download before the acknowledgement unlocks Continue", async () => {
    renderWalletStep({ linkPasskey: false });
    skipPassword();
    expect(screen.getByText("Download your paper wallet before continuing.")).toBeTruthy();
    fireEvent.click(savedKey());
    acceptPlatformTerms();
    expect(button(/continue to wallet/i)).toHaveProperty("disabled", true);

    await act(async () => {
      fireEvent.click(button(/download card/i));
    });
    expect(screen.queryByText("Download your paper wallet before continuing.")).toBeNull();
    expect(button(/continue to wallet/i)).toHaveProperty("disabled", false);
  });

  it("requires explicit platform terms acceptance after saving the paper wallet", async () => {
    renderWalletStep({ linkPasskey: false });
    await savePaperWallet();

    const terms = screen.getByRole("checkbox", { name: "Accept Terms and Conditions" });
    const link = screen.getByRole("link", { name: "Terms and Conditions" });
    const continueButton = button(/continue to wallet/i);

    expect(link.getAttribute("href")).toBe("https://docs.cosmolocal.credit/governance/terms");
    expect(continueButton).toHaveProperty("disabled", true);

    fireEvent.click(link);
    expect(terms.hasAttribute("data-checked")).toBe(false);
    expect(continueButton).toHaveProperty("disabled", true);

    fireEvent.click(terms);
    expect(continueButton).toHaveProperty("disabled", false);
  });

  it("shows a pending view and opens the wallet only after smart-wallet activation confirms", async () => {
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();

    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });

    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: STABLE_PK,
      avatarFile: PHOTO,
    });
    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: STABLE_PK });
    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    const phases = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(phases).toEqual(["AccountDone", "Paper walletPending", "Network", "Wallet"]);
    expect(screen.queryByRole("button", { name: /continue to wallet/i })).toBeNull();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();

    mockDelegateStep.current = "done";
    rerender(<WalletStepFixture />);

    await waitFor(() => expect(mockOnDone).toHaveBeenCalledTimes(1));
    expect(mockStorePrivateKey).toHaveBeenCalledWith(STABLE_PK);
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "pk" } }),
    );
  });

  it("marks the network phase while activation confirms on chain", async () => {
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();
    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });
    mockDelegateStep.current = "confirming";
    rerender(<WalletStepFixture />);
    const current = screen
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("aria-current") === "step");
    expect(current?.textContent).toBe("NetworkConfirming");
    expect(screen.getByText("Activating on chain…")).toBeTruthy();
  });

  it("paper path: session failure after connect does not clear the key and retries session only", async () => {
    mockGetSession.mockResolvedValueOnce(null).mockResolvedValue({
      address: FAKE_ADDRESS,
      chainId: 42220,
    });
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();

    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });

    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();

    mockDelegateStep.current = "done";
    rerender(<WalletStepFixture />);

    await waitFor(() => expect(screen.getByText(/session could not be verified/i)).toBeTruthy());
    expect(mockStorePrivateKey).toHaveBeenCalled();
    // Key must not be cleared after a successful connector + failed session.
    // Asserted as ordering rather than "never called", because this flow now
    // clears any *previous* user's credentials immediately before storing this
    // key — a device the app is shared on may hold someone else's. What must
    // never happen is a clear landing after the store.
    const lastStore = Math.max(...mockStorePrivateKey.mock.invocationCallOrder);
    expect(mockClearPrivateKey.mock.invocationCallOrder.filter((at) => at > lastStore)).toEqual([]);
    expect(mockOnDone).not.toHaveBeenCalled();

    const connectCalls = mockConnect.mock.calls.length;
    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });
    await waitFor(() => expect(mockOnDone).toHaveBeenCalled());
    expect(mockConnect.mock.calls.length).toBe(connectCalls);
  });

  it("returns to Save your card when smart-wallet activation fails", async () => {
    mockDelegateMutateAsync.mockRejectedValue(new Error("delegate failed"));
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();

    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });

    mockDelegateStep.current = "error";
    mockDelegateError.current = "delegate failed";
    rerender(<WalletStepFixture />);

    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: STABLE_PK });
    expect(screen.getByRole("alert").textContent).toBe("delegate failed");
    expect(
      screen
        .getByRole("checkbox", { name: "Accept Terms and Conditions" })
        .hasAttribute("data-checked"),
    ).toBe(true);
    expect(button(/continue to wallet/i)).toBeTruthy();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();
  });

  it("does NOT call storePrivateKey when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();
    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });
    expect(mockDelegateMutateAsync).not.toHaveBeenCalled();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();
  });

  it("renders a backend registration failure once and retains the retry prerequisites", async () => {
    const signupError = new BackendApiError(400, "Validation failed on one or more fields", "E04");
    mockBackendSignupMutateAsync.mockRejectedValue(signupError);
    const { rerender } = renderWalletStep({ linkPasskey: false });
    await completeWalletRequirements();

    await act(async () => {
      fireEvent.click(button(/continue to wallet/i));
    });

    mockBackendSignupError.current = signupError;
    rerender(<WalletStepFixture />);

    expect(screen.getAllByText("E04: Validation failed on one or more fields")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe(
      "E04: Validation failed on one or more fields",
    );
    expect(savedKey().hasAttribute("data-checked")).toBe(true);
    expect(
      screen
        .getByRole("checkbox", { name: "Accept Terms and Conditions" })
        .hasAttribute("data-checked"),
    ).toBe(true);
    expect(button(/continue to wallet/i)).toHaveProperty("disabled", false);
    expect(mockDelegateMutateAsync).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockClearPrivateKey).not.toHaveBeenCalled();
    expect(mockStorePrivateKey).not.toHaveBeenCalled();
    expect(mockOnDone).not.toHaveBeenCalled();
  });
});

describe("OnboardingWalletStep link flow", () => {
  beforeEach(() => {
    mockPickPasskeyProvider.mockReturnValue("google");
  });

  it("keeps passkey linking disabled until platform terms are accepted", async () => {
    renderWalletStep({ linkPasskey: true });
    await savePaperWallet();
    fireEvent.click(button(/^continue$/i));

    const linkButton = button(/link wallet to google/i);
    expect(linkButton).toHaveProperty("disabled", true);

    acceptPlatformTerms();
    expect(linkButton).toHaveProperty("disabled", false);
  });

  it("clicking Link wallet to Google after acknowledging calls upgradeAndLink.mutate", async () => {
    renderWalletStep({ linkPasskey: true });
    await completeWalletRequirements({ linkPasskey: true });
    await act(async () => {
      fireEvent.click(button(/link wallet to google/i));
    });
    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: STABLE_PK,
      avatarFile: PHOTO,
    });
    expect(mockUpgradeAndLinkMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: /setting up your wallet/i })).toBeTruthy();
    const phases = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(phases).toEqual(["AccountDone", "PasskeyPending", "Network", "Wallet"]);
    expect(screen.queryByRole("button", { name: /link wallet to google/i })).toBeNull();
  });

  it("does NOT call upgradeAndLink when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    renderWalletStep({ linkPasskey: true });
    await completeWalletRequirements({ linkPasskey: true });
    await act(async () => {
      fireEvent.click(button(/link wallet to google/i));
    });
    expect(mockUpgradeAndLinkMutate).not.toHaveBeenCalled();
  });
});

describe("OnboardingWalletStep back navigation", () => {
  it("renders a back control on every page", async () => {
    renderWalletStep({ linkPasskey: true });
    expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
    await savePaperWallet();
    expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
    fireEvent.click(button(/^continue$/i));
    expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
  });
});
