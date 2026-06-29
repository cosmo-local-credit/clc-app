import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";

const {
  mockUpgradeAndLinkMutate,
  mockUpgradeStep,
  mockBackendSignupMutateAsync,
  mockDelegateMutateAsync,
  mockDelegateStep,
  mockConnect,
  mockStorePrivateKey,
  mockIsPasskeyPlatformAvailable,
  mockPickPasskeyProvider,
  mockOnDone,
  mockOnBack,
  mockEncryptPaperWalletPrivateKey,
} = vi.hoisted(() => ({
  mockUpgradeAndLinkMutate: vi.fn(),
  mockUpgradeStep: { current: "idle" as string },
  mockBackendSignupMutateAsync: vi
    .fn()
    .mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" }),
  mockDelegateMutateAsync: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  mockDelegateStep: { current: "idle" as string },
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockStorePrivateKey: vi.fn(),
  mockIsPasskeyPlatformAvailable: vi.fn(() => false),
  mockPickPasskeyProvider: vi.fn<() => PasskeyProvider>(() => "google"),
  mockOnDone: vi.fn(),
  mockOnBack: vi.fn(),
  mockEncryptPaperWalletPrivateKey: vi.fn().mockResolvedValue("6PYEncryptedPaperWallet"),
}));

const FAKE_PK =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const FAKE_ADDRESS = "0xFakeAddress1234567890abcdef1234567890aaaa" as `0x${string}`;

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("viem/accounts", () => ({
  generatePrivateKey: () => FAKE_PK,
  privateKeyToAccount: () => ({ address: FAKE_ADDRESS }),
}));

vi.mock("#/features/onboarding/ui/paper-wallet-card", () => ({
  PaperWalletCard: ({ address }: { address: string }) => (
    <div data-testid="paper-wallet-card">{address}</div>
  ),
}));

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
}));

vi.mock("#/connectors/privateKey", () => ({
  storePrivateKey: (pk: string) => mockStorePrivateKey(pk),
  clearPrivateKey: vi.fn(),
}));

vi.mock("wagmi/actions", () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

vi.mock("#/providers/web3-config", () => ({
  pkConnector: { id: "pk" },
  caliburConnector: { id: "calibur" },
  wagmiConfig: {},
}));

vi.mock("#/features/webauthn/api/relayer-client", () => ({
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
    error: null,
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

vi.mock("#/lib/paper-wallet-encryption", () => ({
  encryptPaperWalletPrivateKey: (...args: unknown[]) => mockEncryptPaperWalletPrivateKey(...args),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";
import { OnboardingWalletStep } from "./onboarding-wallet-step";

const PROFILE: ProfileInput = {
  name: "Alice",
  email: "alice@example.com",
  phone: "",
  location: {
    lat: -1.2921,
    lng: 36.8219,
    locationName: "Nairobi, Kenya",
    country: "KE",
  },
};

beforeEach(() => {
  mockUpgradeAndLinkMutate.mockClear();
  mockBackendSignupMutateAsync.mockReset();
  mockBackendSignupMutateAsync.mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" });
  mockDelegateMutateAsync.mockReset();
  mockDelegateMutateAsync.mockResolvedValue({ result: { trackingId: "tracking-1" } });
  mockDelegateStep.current = "idle";
  mockConnect.mockClear();
  mockStorePrivateKey.mockClear();
  mockOnDone.mockClear();
  mockOnBack.mockClear();
  mockEncryptPaperWalletPrivateKey.mockClear();
  mockEncryptPaperWalletPrivateKey.mockResolvedValue("6PYEncryptedPaperWallet");
  mockConnect.mockResolvedValue(undefined);
  mockUpgradeStep.current = "idle";
  mockIsPasskeyPlatformAvailable.mockReturnValue(false);
  mockPickPasskeyProvider.mockReturnValue("google");
});

describe("OnboardingWalletStep rendering", () => {
  it("shows the paper wallet card with the generated address", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByTestId("paper-wallet-card")).toBeTruthy();
    expect(screen.getByText(FAKE_ADDRESS)).toBeTruthy();
  });

  it("shows the download button", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("shows the acknowledgement checkbox", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByLabelText(/i have saved this key/i)).toBeTruthy();
  });

  it("hides Link button on non-passkey platforms", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(false);
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.queryByRole("button", { name: /link wallet/i })).toBeNull();
  });

  it("shows Link wallet to Google passkey button on Android Chrome", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("google");
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByRole("button", { name: /link wallet to google passkey/i })).toBeTruthy();
  });

  it("shows Link wallet to Apple ID passkey button on iOS Safari", () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("apple");
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByRole("button", { name: /link wallet to apple id passkey/i })).toBeTruthy();
  });

  it("shows a disabled linked state after passkey linking succeeds", async () => {
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockUpgradeStep.current = "done";
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);

    const linkedButton = screen.getByRole("button", {
      name: /link wallet to google passkey/i,
    });
    expect(linkedButton).toHaveProperty("disabled", true);
    expect(screen.getByText(/passkey linked/i)).toBeTruthy();
    await act(async () => {});
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "calibur" } }),
    );
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingWalletStep continue flow", () => {
  it("Continue button is disabled before acknowledging", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("Continue button is enabled after checking the ack checkbox", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("requires applying QR protection before continuing when protection is enabled", async () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
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

    expect(mockEncryptPaperWalletPrivateKey).toHaveBeenCalledWith(FAKE_PK, "wallet passphrase");
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    expect(screen.getByRole("button", { name: /continue to wallet/i })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("clicking Continue requests smart-wallet activation after backend signup and opens the wallet", async () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });

    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: FAKE_PK,
    });
    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: FAKE_PK });
    expect(mockStorePrivateKey).toHaveBeenCalledWith(FAKE_PK);
    expect(mockConnect).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ connector: { id: "pk" } }),
    );
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });

  it("opens the wallet when smart-wallet activation request fails", async () => {
    mockDelegateMutateAsync.mockRejectedValue(new Error("delegate failed"));
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue to wallet/i }));
    });

    expect(mockDelegateMutateAsync).toHaveBeenCalledWith({ privateKey: FAKE_PK });
    expect(mockStorePrivateKey).toHaveBeenCalledWith(FAKE_PK);
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });

  it("does NOT call storePrivateKey when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
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
    mockIsPasskeyPlatformAvailable.mockReturnValue(true);
    mockPickPasskeyProvider.mockReturnValue("google");
  });

  it("disables passkey linking before acknowledging the saved key", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);

    expect(screen.getByRole("button", { name: /link wallet to google passkey/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("clicking Link wallet to Google passkey after acknowledging calls upgradeAndLink.mutate", async () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /link wallet to google passkey/i }));
    });
    expect(mockBackendSignupMutateAsync).toHaveBeenCalledWith({
      profile: PROFILE,
      privateKey: FAKE_PK,
    });
    expect(mockUpgradeAndLinkMutate).toHaveBeenCalledTimes(1);
  });

  it("does NOT call upgradeAndLink when backendSignup throws", async () => {
    mockBackendSignupMutateAsync.mockRejectedValue(new Error("signup failed"));
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByLabelText(/i have saved this key/i));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /link wallet to google passkey/i }));
    });
    expect(mockUpgradeAndLinkMutate).not.toHaveBeenCalled();
  });
});

describe("OnboardingWalletStep back navigation", () => {
  it("clicking back calls onBack", () => {
    render(<OnboardingWalletStep profileData={PROFILE} onBack={mockOnBack} onDone={mockOnDone} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
