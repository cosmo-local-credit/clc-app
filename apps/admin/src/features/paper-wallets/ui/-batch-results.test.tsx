import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ table: vi.fn() }));
vi.mock("#/components/admin/data-table", () => ({
  DataTable: () => {
    mocks.table();
    return <div data-testid="wallet-table" />;
  },
}));

import { BatchResults } from "./batch-results";
import type { BatchWallet } from "../use-paper-wallet-batch";

const wallets: BatchWallet[] = [
  {
    id: 0,
    address: `0x${"a".repeat(40)}`,
    recipient: { name: "Amina", email: "", phone: "", country: "", currency: "" },
    status: "ready",
  },
];

const actions = {
  onDownloadPdf: vi.fn(),
  onDownloadManifest: vi.fn(),
  onRetryFailed: vi.fn(),
  onReset: vi.fn(),
};

describe("BatchResults PDF progress", () => {
  afterEach(() => mocks.table.mockClear());

  it("shows progress immediately and leaves the wallet table alone as it advances", () => {
    const props = {
      wallets,
      phase: "done" as const,
      encrypted: 0,
      rendered: 0,
      pdfDownloaded: false,
      ...actions,
    };
    const view = render(<BatchResults {...props} renderStage="preparing" />);

    expect(screen.getByText("Preparing card design…")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "PDF generation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Creating PDF…" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(mocks.table).toHaveBeenCalledTimes(1);

    view.rerender(<BatchResults {...props} renderStage="cards" rendered={1} />);
    expect(screen.getByText("Drawing cards… 1 / 1")).toBeTruthy();
    expect(mocks.table).toHaveBeenCalledTimes(1);

    view.rerender(<BatchResults {...props} renderStage="assembling" rendered={1} />);
    expect(screen.getByText("Assembling PDF…")).toBeTruthy();
    expect(mocks.table).toHaveBeenCalledTimes(1);
  });
});
