import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { abortWalletSwitch } from "#/lib/wallet-session";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";

const PRIVATE_KEY = `0x${"aa".repeat(32)}` as const;
const ADDRESS = privateKeyToAccount(PRIVATE_KEY).address;
const OTHER_KEY = `0x${"bb".repeat(32)}` as const;

type FakeConnector = { id: string };
const paper: FakeConnector = { id: "private-key" };
const passkeyConnector: FakeConnector = { id: "calibur-webauthn" };

const mocks = vi.hoisted(() => ({
  wallet: { current: null as { connector: FakeConnector; address: string } | null },
  connect: vi.fn(),
  disconnect: vi.fn(),
  registerPasskey: vi.fn(),
  getSession: vi.fn(),
  getWebAuthnCredentials: vi.fn(),
  trackRelay: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    connector: mocks.wallet.current?.connector,
    address: mocks.wallet.current?.address,
  }),
}));
vi.mock("wagmi/actions", () => ({
  connect: mocks.connect,
  disconnect: mocks.disconnect,
  getConnection: () => ({
    connector: mocks.wallet.current?.connector,
    address: mocks.wallet.current?.address,
  }),
}));
vi.mock("#/providers/web3-config", () => ({
  caliburConnector: { id: "calibur-webauthn" },
  wagmiConfig: { state: { connections: new Map() } },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  authSessionQueryKey: ["auth", "session"],
  useAuthStatus: () => ({ isAuthenticated: mocks.wallet.current !== null }),
}));
vi.mock("#/features/webauthn/api/register-passkey", () => ({
  registerPasskey: mocks.registerPasskey,
}));
vi.mock("#/lib/api/auth", () => ({
  authClient: {
    getSession: mocks.getSession,
    getWebAuthnCredentials: mocks.getWebAuthnCredentials,
  },
}));
vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay: mocks.trackRelay }),
}));
vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  usePlatformPasskeyLabel: () => ({ available: true, provider: "google", label: "Google" }),
}));
vi.mock("#/features/webauthn/hooks/browser-support", () => ({
  getWebAuthnSupportError: () => null,
}));

import { useLinkPasskey } from "./use-link-passkey";

const REGISTRATION = {
  trackingId: "tracking-1",
  credentialId: "cred-new",
  keyHash: `0x${"cc".repeat(32)}`,
  publicKeyX: "1",
  publicKeyY: "2",
  address: ADDRESS,
};

let credentials: {
  credentialId: string;
  state: string;
  createdAt: string;
  trackingId: string | null;
}[];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function successfulTracking() {
  return {
    result: {
      otx: [
        {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_EXEC",
          txHash: "0xabc",
          nonce: 0,
          replaced: false,
          createdAt: "2026-09-24T00:00:00Z",
          status: "SUCCESS",
        },
      ],
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  storePrivateKey(PRIVATE_KEY);
  mocks.wallet.current = { connector: paper, address: ADDRESS };
  credentials = [];
  mocks.getSession.mockImplementation(async () => ({ address: ADDRESS, chainId: 100 }));
  mocks.getWebAuthnCredentials.mockImplementation(async () => ({ address: ADDRESS, credentials }));
  mocks.registerPasskey.mockImplementation(async () => {
    credentials = [
      { credentialId: "cred-new", state: "pending", createdAt: "", trackingId: "tracking-1" },
    ];
    return REGISTRATION;
  });
  mocks.trackRelay.mockImplementation(async () => {
    credentials = [{ credentialId: "cred-new", state: "active", createdAt: "", trackingId: null }];
    return successfulTracking();
  });
  mocks.connect.mockImplementation(async () => {
    mocks.wallet.current = { connector: passkeyConnector, address: ADDRESS };
  });
  mocks.disconnect.mockImplementation(
    async (_config: unknown, params?: { connector?: FakeConnector }) => {
      if (params?.connector === passkeyConnector) {
        localStorage.removeItem("clc_webauthn");
        mocks.wallet.current = { connector: paper, address: ADDRESS };
      }
      if (params?.connector === paper) localStorage.removeItem("clc_pk_raw");
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

async function renderReady() {
  const hook = renderHook(() => useLinkPasskey(ADDRESS), { wrapper });
  await waitFor(() => expect(hook.result.current.state.kind).not.toBe("loading"));
  return hook;
}

describe("useLinkPasskey status", () => {
  it("offers linking to a paper-wallet session with no passkey", async () => {
    const { result } = await renderReady();
    expect(result.current.state).toEqual({ kind: "available" });
    expect(result.current.isPaperSession).toBe(true);
  });

  it("reports a passkey on another device instead of 'not linked'", async () => {
    credentials = [
      { credentialId: "cred-phone", state: "active", createdAt: "", trackingId: null },
    ];
    const { result } = await renderReady();
    expect(result.current.state).toEqual({ kind: "linked-elsewhere" });
  });

  it("never infers 'not linked' from a failed status read", async () => {
    mocks.getWebAuthnCredentials.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useLinkPasskey(ADDRESS), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ kind: "unavailable" }));
  });
});

describe("useLinkPasskey link", () => {
  it("registers, confirms, then moves the same wallet onto the passkey", async () => {
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.step).toBe("done"));

    expect(mocks.registerPasskey).toHaveBeenCalledTimes(1);
    expect(mocks.registerPasskey.mock.calls[0]?.[0]).toBe(PRIVATE_KEY);
    expect(mocks.connect).toHaveBeenCalledWith(expect.anything(), {
      connector: { id: "calibur-webauthn" },
    });
    expect(mocks.disconnect).toHaveBeenCalledWith(expect.anything(), { connector: paper });
    expect(mocks.wallet.current).toEqual({ connector: passkeyConnector, address: ADDRESS });
    expect(getWebAuthnCredential()).toMatchObject({ credentialId: "cred-new", address: ADDRESS });
    // The card is the recovery method; the raw key does not stay on the device.
    expect(getStoredKey()).toBeNull();
  });

  it("asks for the paper wallet instead of generating a key when none is stored", async () => {
    localStorage.removeItem("clc_pk_raw");
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("missing-key"));
    expect(mocks.registerPasskey).not.toHaveBeenCalled();
  });

  it("refuses before any prompt when the stored key belongs to another wallet", async () => {
    storePrivateKey(OTHER_KEY);
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("identity-mismatch"));
    expect(mocks.registerPasskey).not.toHaveBeenCalled();
  });

  it("refuses when the backend session is for a different wallet", async () => {
    const { result } = await renderReady();
    mocks.getSession.mockResolvedValue({
      address: privateKeyToAccount(OTHER_KEY).address,
      chainId: 100,
    });

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("identity-mismatch"));
    expect(mocks.registerPasskey).not.toHaveBeenCalled();
  });

  it("leaves the paper wallet intact when the prompt is cancelled", async () => {
    mocks.registerPasskey.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("cancelled"));
    expect(getStoredKey()).toBe(PRIVATE_KEY);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.wallet.current?.connector).toBe(paper);
  });

  it("never claims success, or stores a credential, when the registration reverts", async () => {
    mocks.trackRelay.mockImplementation(async () => {
      credentials = [
        { credentialId: "cred-new", state: "failed", createdAt: "", trackingId: null },
      ];
      const tracking = successfulTracking();
      tracking.result.otx[0]!.status = "REVERTED";
      return tracking;
    });
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("failed"));
    expect(getWebAuthnCredential()).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(getStoredKey()).toBe(PRIVATE_KEY);
  });

  it("restores the paper connection when the switch fails, and retries it without re-registering", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("connector exploded"));
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("connection-failed"));
    expect(mocks.wallet.current).toEqual({ connector: paper, address: ADDRESS });
    expect(getStoredKey()).toBe(PRIVATE_KEY);
    expect(getWebAuthnCredential()).toMatchObject({ credentialId: "cred-new" });
    await waitFor(() => expect(result.current.state.kind).toBe("linked-here"));

    await act(async () => result.current.retryConnection());
    await waitFor(() => expect(result.current.step).toBe("done"));
    expect(mocks.registerPasskey).toHaveBeenCalledTimes(1);
    expect(mocks.wallet.current).toEqual({ connector: passkeyConnector, address: ADDRESS });
  });

  it("drops the passkey connection again when it verifies against a different session", async () => {
    const { result } = await renderReady();
    // Sessions are read before the prompt and again after the connect.
    mocks.getSession
      .mockResolvedValueOnce({ address: ADDRESS, chainId: 100 })
      .mockResolvedValueOnce({ address: privateKeyToAccount(OTHER_KEY).address, chainId: 100 });

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.error?.kind).toBe("connection-failed"));
    expect(mocks.disconnect).toHaveBeenCalledWith(expect.anything(), {
      connector: passkeyConnector,
    });
    expect(mocks.wallet.current).toEqual({ connector: paper, address: ADDRESS });
    expect(getWebAuthnCredential()).toMatchObject({ credentialId: "cred-new" });
  });

  it("stores nothing for the previous wallet when sign-out lands mid-confirmation", async () => {
    mocks.trackRelay.mockImplementation(async () => {
      abortWalletSwitch();
      credentials = [
        { credentialId: "cred-new", state: "active", createdAt: "", trackingId: null },
      ];
      return successfulTracking();
    });
    const { result } = await renderReady();

    await act(async () => result.current.link());
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error).toBeNull();
    expect(getWebAuthnCredential()).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
