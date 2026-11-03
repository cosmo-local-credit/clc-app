import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ connectorId: "private-key" }));
vi.mock("wagmi", () => ({ useConnection: () => ({ connector: { id: mocks.connectorId } }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a href="/settings/sign-in-card">{children}</a>,
}));
vi.mock("#/providers/web3-config", () => ({ wagmiConfig: {}, pkConnector: { id: "private-key" } }));
vi.mock("#/lib/key-rotation-config", () => ({ KEY_ROTATION_ENABLED: true }));

import { SignInCardSettingsSection } from "./sign-in-card-settings-section";

const ADDRESS = "0x6a347bA6B1eC10348478377c5fCeE7Ceb6921A69";

function answer(credentialState: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const result = url.includes("/auth/webauthn/credentials")
        ? {
            address: ADDRESS,
            credentials: [
              {
                credentialId: "cred",
                state: credentialState,
                createdAt: "",
                trackingId: null,
                publicKeyX: "1",
                publicKeyY: "2",
              },
            ],
          }
        : { rotations: [] };
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SignInCardSettingsSection address={ADDRESS} />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.connectorId = "private-key";
});

describe("SignInCardSettingsSection", () => {
  // clc-core returns a carried passkey whose registration reverted to `moved`,
  // so the retry stays here after leaving Settings or reloading.
  it("offers to finish moving a passkey the new wallet has not registered", async () => {
    answer("moved");
    renderSection();
    expect(await screen.findByText("Finish moving your passkey")).toBeTruthy();
  });

  it("leaves a passkey that failed outside a replacement to its own settings", async () => {
    answer("failed");
    const client = renderSection();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText("Finish moving your passkey")).toBeNull();
    expect(screen.getByText("Replace sign-in card")).toBeTruthy();
  });

  it("needs the new card's key, so a passkey session is not offered the retry", async () => {
    mocks.connectorId = "calibur-webauthn";
    answer("moved");
    const client = renderSection();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText("Finish moving your passkey")).toBeNull();
  });
});
