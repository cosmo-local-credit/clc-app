import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CHAIN_ID } from "#/lib/chain";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

const { identity, toast, useConnectionMock } = vi.hoisted(() => ({
  identity: { data: null as null | { alias: string; name: string } },
  toast: { success: vi.fn(), error: vi.fn() },
  useConnectionMock: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useConnection: () => useConnectionMock(),
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => identity,
}));

const qrCode = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock("qrcode", () => ({ default: qrCode }));

vi.mock("sonner", () => ({
  toast,
}));

import { ReceivePage } from "./receive-page";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  identity.data = null;
  qrCode.toDataURL.mockResolvedValue("data:image/png;base64,qr-code");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReceivePage", () => {
  it("copies the connected wallet address and encodes a chain-specific receive URI", async () => {
    useConnectionMock.mockReturnValue({ address: ADDRESS });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ReceivePage />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(qrCode.toDataURL).toHaveBeenCalledWith(`ethereum:${ADDRESS}@${CHAIN_ID}`, {
        margin: 4,
        width: 184,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );

    const copyButton = screen.getByRole("button", { name: /^copy$/i });
    expect(copyButton.hasAttribute("disabled")).toBe(false);
    copyButton.click();
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });

  it("disables actions and shows a message when there is no address", () => {
    useConnectionMock.mockReturnValue({ address: undefined });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ReceivePage />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/no wallet address available/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^copy$/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^share$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("displays and copies the username while keeping the address in the QR payload", async () => {
    identity.data = { name: "Alice Example", alias: "alice" };
    useConnectionMock.mockReturnValue({ address: ADDRESS });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ReceivePage />
      </QueryClientProvider>,
    );

    expect(screen.getByText("alice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy wallet username" }));

    expect(writeText).toHaveBeenCalledWith("alice");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Username copied"));
    expect(qrCode.toDataURL).toHaveBeenCalledWith(
      `ethereum:${ADDRESS}@${CHAIN_ID}`,
      expect.any(Object),
    );
  });
});
