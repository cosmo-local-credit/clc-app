import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

vi.mock("#/components/paper-wallet-scanner", () => ({
  PaperWalletScanner: ({
    onKeyDecoded,
    onCancel,
  }: {
    onKeyDecoded: (value: string) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onKeyDecoded(`ethereum:${ADDRESS}@100`)}>
        Decode QR
      </button>
      <button type="button" onClick={() => onKeyDecoded(PRIVATE_KEY)}>
        Decode private key
      </button>
      <button type="button" onClick={onCancel}>
        Close scanner
      </button>
    </div>
  ),
}));

import { SendRecipientField } from "./send-recipient-field";

function Harness({
  onRecipientChange,
}: {
  onRecipientChange: (recipient: { address: string } | null) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SendRecipientField
      id="to"
      ariaLabel="Recipient"
      value={value}
      onValueChange={setValue}
      onRecipientChange={onRecipientChange}
    />
  );
}

function renderField() {
  const onRecipientChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness onRecipientChange={onRecipientChange} />
    </QueryClientProvider>,
  );
  return onRecipientChange;
}

describe("SendRecipientField", () => {
  it("refuses a scanned sign-in card and still accepts an address QR", async () => {
    const onRecipientChange = renderField();

    fireEvent.click(screen.getByRole("button", { name: "Scan QR" }));
    fireEvent.click(screen.getByRole("button", { name: "Decode private key" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This QR is a sign-in card. Scan a wallet address.",
    );
    expect((screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Decode private key" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Decode QR" }));

    await waitFor(() =>
      expect(onRecipientChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ address: ADDRESS, source: "qr" }),
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement).value).toBe(
      ADDRESS,
    );
  });
});
