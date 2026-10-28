import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
}));

vi.mock("@clc/core/features/wallet/paper-wallet-encryption", () => ({
  decryptPaperWalletPrivateKey: mocks.decrypt,
}));

import { EncryptedPaperWalletImportForm } from "./encrypted-paper-wallet-import-form";

describe("EncryptedPaperWalletImportForm", () => {
  it("describes the protected card as a sign-in action", async () => {
    const onDecrypted = vi.fn();
    mocks.decrypt.mockResolvedValue(`0x${"1".repeat(64)}`);

    render(
      <EncryptedPaperWalletImportForm
        encryptedKey="encrypted"
        onDecrypted={onDecrypted}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Enter card password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close card password form" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sunflower" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock and sign in" }));

    await waitFor(() => expect(mocks.decrypt).toHaveBeenCalledWith("encrypted", "sunflower"));
    expect(onDecrypted).toHaveBeenCalledWith(`0x${"1".repeat(64)}`);
  });
});
