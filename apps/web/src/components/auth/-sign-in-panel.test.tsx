import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { getWebAuthnCredential, storeWebAuthnCredential } from "#/lib/webauthn-storage";

const ALICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const BOB_KEY = "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61" as const;

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  connect: vi.fn(),
  backendSignin: vi.fn(),
  signin: vi.fn(),
  isConnected: true,
  connectorId: "private-key" as string | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/", searchStr: "", hash: "" }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    isConnected: mocks.isConnected,
    connector: mocks.connectorId ? { id: mocks.connectorId } : undefined,
  }),
  useDisconnect: () => ({ mutateAsync: mocks.disconnect }),
}));

vi.mock("wagmi/actions", () => ({
  connect: mocks.connect,
}));

// Short-circuits the real wagmi config, which builds connectors and a storage
// adapter this test has no use for.
vi.mock("#/providers/web3-config", () => ({
  wagmiConfig: {},
  pkConnector: { id: "private-key" },
  caliburConnector: { id: "calibur-webauthn" },
}));

vi.mock("#/features/auth/hooks/use-backend-auth", () => ({
  useBackendPrivateKeySignin: () => ({ mutateAsync: mocks.backendSignin, isPending: false }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-signin", () => ({
  useCaliburSignin: () => ({ step: "idle", signin: { mutateAsync: mocks.signin } }),
}));

vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  usePlatformPasskeyLabel: () => ({ available: true, provider: "google", label: "Google" }),
}));

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: () => <p>Scanner</p>,
}));

import { SignInPanel } from "./sign-in-panel";

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignInPanel onAuthenticated={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function submitPrivateKey(key: string) {
  fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
  fireEvent.click(screen.getByRole("button", { name: /^private key$/i }));
  // The form opens in a sheet titled Private key; exact, so the field does not
  // also match the form's "Close private key form" button.
  const sheet = screen.getByRole("dialog", { name: "Private key" });
  fireEvent.change(within(sheet).getByLabelText("Private key"), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: /sign in with private key/i }));
}

function aliceCredential() {
  return {
    credentialId: "alice-credential",
    keyHash: "0xhash" as const,
    publicKeyX: "0x1",
    publicKeyY: "0x2",
    address: "0xa316408425cf17f1827483dee621c6c3a9b5fad4" as const,
  };
}

beforeEach(() => {
  localStorage.clear();
  mocks.isConnected = true;
  mocks.connectorId = "private-key";
  mocks.disconnect.mockReset();
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.connect.mockReset();
  mocks.connect.mockResolvedValue(undefined);
  mocks.backendSignin.mockReset();
  mocks.backendSignin.mockResolvedValue(undefined);
  mocks.signin.mockReset();
  mocks.signin.mockResolvedValue(undefined);
});

describe("paper-wallet sign-in credential teardown", () => {
  // The leak this PR names: the private-key connector's disconnect clears only
  // clc_pk_*, so a passkey the previous user registered mid-session survived and
  // offered the next person a sign-in that authenticates as them.
  it("removes the previous user's passkey while keeping the key it just stored", async () => {
    storePrivateKey(ALICE_KEY);
    storeWebAuthnCredential(aliceCredential());

    renderPanel();
    await submitPrivateKey(BOB_KEY);

    await waitFor(() => {
      expect(mocks.connect).toHaveBeenCalled();
    });
    expect(getWebAuthnCredential()).toBeNull();
    expect(getStoredKey()).toBe(BOB_KEY);
  });

  // The review finding: the clear used to sit after `await dropActiveConnection()`,
  // so a rejecting disconnect skipped it and the catch cleared only the private
  // key — the leak survived exactly when teardown mattered most.
  it("removes the previous user's passkey even when disconnect rejects", async () => {
    storePrivateKey(ALICE_KEY);
    storeWebAuthnCredential(aliceCredential());
    mocks.disconnect.mockRejectedValue(new Error("connector gone"));

    renderPanel();
    await submitPrivateKey(BOB_KEY);

    await waitFor(() => {
      expect(getWebAuthnCredential()).toBeNull();
    });
  });

  it("clears before awaiting the disconnect, not after", async () => {
    storePrivateKey(ALICE_KEY);
    storeWebAuthnCredential(aliceCredential());
    let credentialAtDisconnect: unknown = "not-observed";
    mocks.disconnect.mockImplementation(() => {
      credentialAtDisconnect = getWebAuthnCredential();
      return Promise.resolve();
    });

    renderPanel();
    await submitPrivateKey(BOB_KEY);

    await waitFor(() => {
      expect(mocks.disconnect).toHaveBeenCalled();
    });
    // Already gone by the time the await runs, so no rejection can skip it.
    expect(credentialAtDisconnect).toBeNull();
  });

  it("does not strand the previous key when the backend rejects the sign-in", async () => {
    storePrivateKey(ALICE_KEY);
    mocks.backendSignin.mockRejectedValue(new Error("network down"));

    renderPanel();
    await submitPrivateKey(BOB_KEY);

    // Cleared by the catch, and never replaced — a failed sign-in must not leave
    // either account's key behind.
    await waitFor(() => {
      expect(getStoredKey()).toBeNull();
    });
  });
});

describe("passkey sign-in credential teardown", () => {
  it("removes a previous paper wallet while keeping the freshly minted passkey", async () => {
    storePrivateKey(ALICE_KEY);
    mocks.connectorId = "private-key";
    mocks.signin.mockImplementation(() => {
      // Written inside the mutation by useCaliburSignin, which is why the clear
      // has to run after it rather than before.
      storeWebAuthnCredential(aliceCredential());
      return Promise.resolve();
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /google/i }));

    await waitFor(() => {
      expect(getStoredKey()).toBeNull();
    });
    expect(getWebAuthnCredential()).toMatchObject({ credentialId: "alice-credential" });
  });

  it("leaves the incumbent key alone when the assertion fails", async () => {
    storePrivateKey(ALICE_KEY);
    mocks.signin.mockRejectedValue(new Error("assertion rejected"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /google/i }));

    await waitFor(() => {
      expect(mocks.signin).toHaveBeenCalled();
    });
    expect(getStoredKey()).toBe(ALICE_KEY);
  });
});

describe("sign-in method layout", () => {
  it("leads with the passkey and lists the paper wallet as a row beneath it", () => {
    renderPanel();
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons[0]).toContain("Continue with Google");
    expect(buttons[1]).toContain("Continue with Paper Wallet");
    expect(screen.queryByRole("button", { name: /^private key$/i })).toBeNull();
  });

  it("opens the paper wallet scanner in a sheet over the methods", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /continue with paper wallet/i }));
    const sheet = await screen.findByRole("dialog", { name: "Paper Wallet" });
    expect(within(sheet).getByText("Scanner")).toBeTruthy();
    // Still on the page behind the sheet, hidden from the accessibility tree while it is open.
    expect(
      screen.getByRole("button", { name: /continue with google/i, hidden: true }),
    ).toBeTruthy();
  });

  it("keeps the private key behind Advanced options", () => {
    renderPanel();
    const advanced = screen.getByRole("button", { name: /advanced options/i });
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(advanced);
    expect(advanced.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /^private key$/i })).toBeTruthy();
  });
});
