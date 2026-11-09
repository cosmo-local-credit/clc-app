import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const TOKEN = "0xAbC0000000000000000000000000000000000123";
const OWNER = "0x1111111111111111111111111111111111111111";
const SAFE = "0x5AFE000000000000000000000000000000000005";

const mocks = vi.hoisted(() => ({
  ownerInfo: { info: undefined, isSafeOwned: false, isSafeSigner: false } as {
    info: unknown;
    isSafeOwned: boolean;
    isSafeSigner: boolean;
  },
  mint: vi.fn(),
  burn: vi.fn(),
  transfer: vi.fn(),
  report: vi.fn((_error: unknown, _fallback: string) => false),
  balance: "1234" as string | undefined,
  inFlight: { mint: false, burn: false, ownership: false },
}));

vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => mocks.ownerInfo,
}));
vi.mock("#/features/vouchers/hooks/use-voucher-mint", () => ({
  useVoucherMint: () => ({
    mutateAsync: mocks.mint,
    isPending: false,
    inFlight: mocks.inFlight.mint,
    reportError: mocks.report,
  }),
}));
vi.mock("#/features/vouchers/hooks/use-voucher-burn", () => ({
  useVoucherBurn: () => ({
    mutateAsync: mocks.burn,
    isPending: false,
    inFlight: mocks.inFlight.burn,
  }),
  useVoucherOwnerBalance: () => ({ data: mocks.balance, isPending: false }),
  voucherOwnerBalanceQueryKeys: { all: ["voucher-owner-balance"] },
}));
vi.mock("#/features/vouchers/hooks/use-voucher-ownership-transfer", () => ({
  useVoucherOwnershipTransfer: () => ({
    mutateAsync: mocks.transfer,
    isPending: false,
    inFlight: mocks.inFlight.ownership,
  }),
}));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));
vi.mock("#/features/safe/hooks/use-report-write-error", () => ({
  useReportWriteError: () => mocks.report,
}));
vi.mock("#/components/safe/recipient-owner-notice", () => ({ RecipientOwnerNotice: () => null }));
vi.mock("#/components/wallet/recipient-address-input", () => ({
  RecipientAddressInput: ({
    id,
    ariaLabel,
    defaultValue,
    onValueChange,
    disabled,
  }: {
    id: string;
    ariaLabel: string;
    defaultValue?: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

import { VoucherOwnerControls } from "./voucher-controls";

let client: QueryClient;

function renderControls(wallet = OWNER, owner = OWNER) {
  return render(
    <QueryClientProvider client={client}>
      <VoucherOwnerControls
        tokenAddress={TOKEN}
        tokenSymbol="MALII"
        tokenDecimals={2}
        ownerAddress={owner}
        walletAddress={wallet}
        editable={null}
      />
    </QueryClientProvider>,
  );
}

function controlLabels() {
  return within(screen.getByRole("group", { name: "Voucher controls" }))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

beforeEach(() => {
  client = new QueryClient();
  mocks.ownerInfo = { info: undefined, isSafeOwned: false, isSafeSigner: false };
  mocks.mint.mockReset().mockResolvedValue({ trackingId: "mint-1" });
  mocks.burn.mockReset().mockResolvedValue({ trackingId: "burn-1" });
  mocks.transfer.mockReset().mockResolvedValue({ trackingId: "owner-1", catalogSynced: true });
  mocks.report.mockReset().mockReturnValue(false);
  mocks.balance = "1234";
  mocks.inFlight = { mint: false, burn: false, ownership: false };
});

describe("Destroy vouchers on the desktop voucher page", () => {
  it("sits right below Create vouchers for an owner who signs directly", () => {
    renderControls();
    const labels = controlLabels();
    expect(labels.indexOf("Destroy vouchers")).toBe(labels.indexOf("Create vouchers") + 1);
  });

  it("is not offered on a voucher a multisig owns", () => {
    mocks.ownerInfo = { info: undefined, isSafeOwned: true, isSafeSigner: true };
    renderControls(OWNER, SAFE);
    const labels = controlLabels();
    expect(labels).toContain("Create vouchers");
    expect(labels).not.toContain("Destroy vouchers");
  });

  it("converts the amount, relays the burn, refreshes balances and closes", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Destroy vouchers" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Balance 12.34 MALII")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Destroy vouchers"), {
      target: { value: "12.34" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Destroy vouchers" }));

    await waitFor(() =>
      expect(mocks.burn).toHaveBeenCalledWith({
        tokenAddress: TOKEN,
        ownerAddress: OWNER,
        amountRaw: "1234",
        includeAuthorization: false,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["voucher-owner-balance"] });
  });

  it("refuses to destroy more than the owner holds", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Destroy vouchers" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Destroy vouchers"), {
      target: { value: "12.35" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Destroy vouchers" }));

    expect(await within(dialog).findByText("Amount exceeds your balance")).toBeTruthy();
    expect(mocks.burn).not.toHaveBeenCalled();
  });

  it("stays open after a failed relay and reports it", async () => {
    mocks.burn.mockRejectedValueOnce(new Error("relay rejected"));
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Destroy vouchers" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Destroy vouchers"), {
      target: { value: "1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Destroy vouchers" }));

    await waitFor(() => expect(mocks.report).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("an owner action still running from another view", () => {
  it.each([
    ["Create vouchers", "mint", /Creating vouchers/],
    ["Destroy vouchers", "burn", /Destroying vouchers/],
    ["Transfer ownership", "ownership", /Transferring ownership/],
  ] as const)("holds %s until it settles", async (row, action, busyLabel) => {
    mocks.inFlight[action] = true;
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: row }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: busyLabel });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
  });
});
