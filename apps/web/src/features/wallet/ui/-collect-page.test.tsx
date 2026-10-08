import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  nfcSupported: true,
  health: { chainId: 100, relayerAddress: "0x9", idempotentRelay: true } as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  useClient: () => ({}),
}));

vi.mock("#/lib/nfc/ndef-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/nfc/ndef-adapter")>();
  return {
    ...actual,
    getNdefReaderConstructor: () => null,
    useWebNfcSupported: () => mocks.nfcSupported,
  };
});

vi.mock("@clc/api/features/relayer/queries", () => ({
  relayerHealthQueryOptions: () => ({
    queryKey: ["clc", "relayer", "health"],
    queryFn: async () => mocks.health,
  }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountTokensInfinite: () => ({
    isSuccess: true,
    isError: false,
    data: {
      pages: [
        {
          tokens: [
            {
              tokenAddress: "0x4444444444444444444444444444444444444444",
              tokenSymbol: "SRF",
              tokenName: "Sarafu",
              tokenDecimals: 6,
              balance: "0",
              iconUrl: null,
            },
          ],
        },
      ],
    },
  }),
}));

vi.mock("#/components/wallet/recipient-identity-label", () => ({
  RecipientIdentityLabel: () => <span>me</span>,
}));

import { CollectPage } from "./collect-page";

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CollectPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.nfcSupported = true;
  mocks.health = { chainId: 100, relayerAddress: "0x9", idempotentRelay: true };
});

describe("CollectPage", () => {
  it("arms only once the voucher and a positive amount are on screen", async () => {
    renderPage();
    const ready = await screen.findByRole("button", { name: /ready to collect/i });
    expect(ready.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/amount to collect/i), { target: { value: "2.5" } });
    const armed = await screen.findByRole("button", { name: /ready to collect 2\.5 SRF/i });
    await vi.waitFor(() => expect(armed.hasAttribute("disabled")).toBe(false));
  });

  it("caps the amount at the voucher's decimals", async () => {
    renderPage();
    const input = await screen.findByLabelText(/amount to collect/i);
    fireEvent.change(input, { target: { value: "1.23456789" } });
    expect((input as HTMLInputElement).value).toBe("1.234567");
  });

  it("stays disarmed on a relay that cannot reconcile a lost response", async () => {
    mocks.health = { chainId: 100, relayerAddress: "0x9" };
    renderPage();
    expect(await screen.findByText(/isn't available on this server yet/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/amount to collect/i), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: /ready to collect/i }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("refuses a relay on another network", async () => {
    mocks.health = { chainId: 42220, relayerAddress: "0x9", idempotentRelay: true };
    renderPage();
    expect(await screen.findByText(/relay is on a different network/i)).toBeTruthy();
  });

  it("explains a phone without Web NFC and never arms", async () => {
    mocks.nfcSupported = false;
    renderPage();
    expect(await screen.findByText(/can't read NFC cards/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/amount to collect/i), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: /ready to collect/i }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
