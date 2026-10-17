import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { getWebAuthnCredential, storeWebAuthnCredential } from "#/lib/webauthn-storage";

const nearbyAuth = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  authSessionQueryKey: ["auth", "session"],
  useAuthStatus: () => ({ ...nearbyAuth, isLoading: false, address: "0xabc", chainId: 100 }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: { geoLat: 0, geoLng: 0 }, isPending: false, isError: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const { mockAbortWalletSwitch, mockClearPersistedLocation, mockBackendLogout, mockDisconnect } =
  vi.hoisted(() => ({
    mockAbortWalletSwitch: vi.fn(),
    mockClearPersistedLocation: vi.fn(),
    mockBackendLogout: vi.fn(),
    mockDisconnect: vi.fn(),
  }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0xabc" as `0x${string}` }),
  useDisconnect: () => ({ mutateAsync: mockDisconnect }),
}));

vi.mock("#/features/auth/hooks/use-auth-session", () => ({
  useBackendLogout: () => ({ mutateAsync: mockBackendLogout }),
}));

vi.mock("#/features/home/api/last-location-storage", () => ({
  clearPersistedLocation: mockClearPersistedLocation,
}));

vi.mock("#/lib/wallet-session", () => ({
  abortWalletSwitch: mockAbortWalletSwitch,
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "checking" as const,
}));

vi.mock("./wallet-page", () => ({
  WalletPage: () => <div data-testid="wallet-page" />,
}));

vi.mock("./activity-page", () => ({
  ActivityPage: () => <div data-testid="activity-page" />,
}));

vi.mock("./market-page", () => ({
  MarketPage: ({
    isAuthenticated,
    locationOwner,
  }: {
    isAuthenticated?: boolean;
    locationOwner?: string;
  }) => (
    <div
      data-testid="market-page"
      data-authenticated={isAuthenticated ? "true" : "false"}
      data-location-owner={locationOwner}
    />
  ),
}));

vi.mock("./market-list-page", () => ({
  MarketListPage: ({ locationOwner }: { locationOwner?: string }) => (
    <div data-testid="market-list-page" data-location-owner={locationOwner} />
  ),
}));

vi.mock("./posts-page", () => ({
  PostsPage: () => <div data-testid="posts-page" />,
}));

vi.mock("./settings-page", () => ({
  SettingsPage: ({ onSignOut }: { onSignOut: () => void }) => (
    <div data-testid="settings-page">
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  ),
}));

import { HomePage } from "./home-page";

function renderHome(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  nearbyAuth.isAuthenticated = true;
  localStorage.clear();
  mockAbortWalletSwitch.mockClear();
  mockClearPersistedLocation.mockClear();
  mockBackendLogout.mockReset();
  mockBackendLogout.mockResolvedValue(undefined);
  mockDisconnect.mockReset();
  mockDisconnect.mockResolvedValue(undefined);
});

describe("HomePage tabs", () => {
  it("shows the market map by default", () => {
    renderHome(<HomePage />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("market-list-page")).toBeNull();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
  });

  it("shows the Browse-all list for the explicit market list view", () => {
    renderHome(<HomePage marketView="list" />);
    expect(screen.getByTestId("market-list-page")).toBeTruthy();
    expect(screen.queryByTestId("market-page")).toBeNull();
  });

  it("renders the requested wallet tab", () => {
    renderHome(<HomePage activeTab="wallet" />);
    expect(screen.getByTestId("wallet-page")).toBeTruthy();
  });

  it("renders the requested activity tab", () => {
    renderHome(<HomePage activeTab="activity" />);
    expect(screen.getByTestId("activity-page")).toBeTruthy();
  });

  it("renders the requested posts tab", () => {
    renderHome(<HomePage activeTab="posts" />);
    expect(screen.getByTestId("posts-page")).toBeTruthy();
  });

  it("renders the requested settings tab", () => {
    renderHome(<HomePage activeTab="settings" />);
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });
});

describe("HomePage guest mode", () => {
  it("renders public Posts for guests", () => {
    nearbyAuth.isAuthenticated = false;
    renderHome(<HomePage activeTab="posts" isAuthenticated={false} />);
    expect(screen.getByTestId("posts-page")).toBeTruthy();
  });

  it("renders the public Market for guests", () => {
    nearbyAuth.isAuthenticated = false;
    renderHome(<HomePage isAuthenticated={false} />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
  });

  it("does not render private content for a requested private tab", () => {
    nearbyAuth.isAuthenticated = false;
    renderHome(<HomePage activeTab="wallet" isAuthenticated={false} />);
    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.queryByTestId("wallet-page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wallet" })).toBeNull();
  });
});

describe("HomePage sign-out", () => {
  it("aborts any pending wallet switch on sign-out", async () => {
    renderHome(<HomePage activeTab="settings" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockAbortWalletSwitch).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the persisted precise location on sign-out", async () => {
    renderHome(<HomePage activeTab="settings" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockClearPersistedLocation).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the persisted location even when backend logout fails", async () => {
    mockBackendLogout.mockRejectedValueOnce(new Error("network down"));
    renderHome(<HomePage activeTab="settings" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    // A precise location must not survive on a shared device just because the
    // server round-trip failed.
    await waitFor(() => {
      expect(mockClearPersistedLocation).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the persisted location even when disconnect rejects", async () => {
    mockDisconnect.mockRejectedValueOnce(new Error("connector gone"));
    renderHome(<HomePage activeTab="settings" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockClearPersistedLocation).toHaveBeenCalledTimes(1);
    });
  });

  // The credential clear used to be a side effect of the connector's
  // `disconnect()`, which sign-out swallows — so a dead connector dropped the
  // user to guest while leaving a raw private key on a shared device.
  it("clears both credentials even when logout and disconnect both reject", async () => {
    storePrivateKey(PRIVATE_KEY);
    storeWebAuthnCredential({
      credentialId: "credential-1",
      keyHash: "0xhash" as const,
      publicKeyX: "0x1",
      publicKeyY: "0x2",
      address: "0xa316408425cf17f1827483dee621c6c3a9b5fad4" as const,
    });
    mockBackendLogout.mockRejectedValueOnce(new Error("network down"));
    mockDisconnect.mockRejectedValueOnce(new Error("connector gone"));

    renderHome(<HomePage activeTab="settings" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(getStoredKey()).toBeNull();
    });
    expect(getWebAuthnCredential()).toBeNull();
  });

  it("clears the credentials before awaiting the backend, not after", async () => {
    storePrivateKey(PRIVATE_KEY);
    let keyAtLogout: string | null = "not-observed";
    mockBackendLogout.mockImplementationOnce(() => {
      keyAtLogout = getStoredKey();
      return Promise.resolve();
    });

    renderHome(<HomePage activeTab="settings" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockBackendLogout).toHaveBeenCalled();
    });
    // Already gone by the time the first `await` runs, so no later failure can
    // leave it behind.
    expect(keyAtLogout).toBeNull();
  });
});

describe("HomePage location scope", () => {
  it("scopes the location to the address only when authenticated", () => {
    renderHome(<HomePage />);

    expect(screen.getByTestId("market-page").getAttribute("data-location-owner")).toBe("0xabc");
    expect(screen.getByTestId("market-page").getAttribute("data-authenticated")).toBe("true");
  });

  it("treats a connected wallet without a session as a guest", () => {
    // docs/AUTH.md: a connected wallet alone is not authentication. An expired
    // session must not keep exposing that wallet's persisted location.
    nearbyAuth.isAuthenticated = false;
    renderHome(<HomePage isAuthenticated={false} />);

    expect(screen.getByTestId("market-page")).toBeTruthy();
    expect(screen.getByTestId("market-page").getAttribute("data-authenticated")).toBe("false");
  });
});
