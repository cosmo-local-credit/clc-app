import type { RetirementPreview, RetirementRequest } from "@clc/api/features/retirement/client";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PoolHeader } from "#/features/pools/ui/pool-header";
import { VoucherHeader } from "#/features/vouchers/ui/voucher-header";
import { RetireResourceSheet } from "./retire-resource-sheet";
import { RetirementResourceHistory } from "./retirement-resource-history";
import { retirementSourceLabel } from "./retirement-status";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  adminRetire: vi.fn(),
  adminResourceHistory: vi.fn(),
  success: vi.fn(),
}));
vi.mock("#/lib/api", () => ({ clcApi: { retirement: mocks } }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/stub">{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }));

function preview(overrides: Partial<RetirementPreview> = {}): RetirementPreview {
  return {
    resourceType: "voucher",
    resourceAddress: ADDRESS,
    chainId: 100,
    ownerAddress: OWNER,
    active: true,
    symbol: "CARE",
    decimals: 6,
    amountOutsideOwnerRaw: "1250000",
    positiveTokenCount: null,
    hasPositiveBalances: true,
    blockNumber: "1234",
    checkedAt: "2026-10-25T12:00:00Z",
    coverage: "total-supply",
    coverageNote: null,
    ...overrides,
  };
}

function renderWith(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function renderSheet(type: "voucher" | "pool" = "voucher", onClose = vi.fn()) {
  renderWith(
    <RetireResourceSheet type={type} address={ADDRESS} name="Care" open onClose={onClose} />,
  );
  return onClose;
}

const retireButton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(preview());
  mocks.adminRetire.mockResolvedValue({ changed: true });
  mocks.adminResourceHistory.mockResolvedValue({ requests: [], events: [] });
});

describe("direct retirement", () => {
  it("requires acknowledgement of positive balances, then retires with it", async () => {
    const onClose = renderSheet();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    expect(retireButton("Retire voucher").disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(retireButton("Retire voucher").disabled).toBe(false);
    fireEvent.click(retireButton("Retire voucher"));

    await waitFor(() =>
      expect(mocks.adminRetire).toHaveBeenCalledWith("voucher", ADDRESS, {
        acknowledgeBalances: true,
      }),
    );
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Retired this voucher."));
    expect(onClose).toHaveBeenCalled();
  });

  it("retires a verified zero balance without an acknowledgement, with a trimmed reason", async () => {
    mocks.preview.mockResolvedValue(
      preview({ amountOutsideOwnerRaw: "0", hasPositiveBalances: false }),
    );
    renderSheet();
    await screen.findByText("Other accounts hold 0 CARE.");
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: /Reason/ }), {
      target: { value: "  Operator closed it  " },
    });
    fireEvent.click(retireButton("Retire voucher"));

    await waitFor(() =>
      expect(mocks.adminRetire).toHaveBeenCalledWith("voucher", ADDRESS, {
        acknowledgeBalances: false,
        reason: "Operator closed it",
      }),
    );
  });

  it("retires a pool through the pool path", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        resourceType: "pool",
        amountOutsideOwnerRaw: null,
        positiveTokenCount: 0,
        hasPositiveBalances: false,
      }),
    );
    renderSheet("pool");
    await screen.findByText(/The pool holds 0 known voucher types/);
    fireEvent.click(retireButton("Retire pool"));

    await waitFor(() =>
      expect(mocks.adminRetire).toHaveBeenCalledWith("pool", ADDRESS, {
        acknowledgeBalances: false,
      }),
    );
  });

  it("says when the resource was already retired and nothing changed", async () => {
    mocks.preview.mockResolvedValue(
      preview({ amountOutsideOwnerRaw: "0", hasPositiveBalances: false }),
    );
    mocks.adminRetire.mockResolvedValue({ changed: false });
    const onClose = renderSheet();
    await screen.findByText("Other accounts hold 0 CARE.");
    fireEvent.click(retireButton("Retire voucher"));

    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith("This voucher was already retired."),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("flags a resource that is already retired", async () => {
    mocks.preview.mockResolvedValue(preview({ active: false }));
    renderSheet();
    await screen.findByText("This voucher is already retired.");
  });

  it("does not read a failed balance check as zero", async () => {
    mocks.preview.mockRejectedValue(new Error("RPC unavailable"));
    renderSheet();
    await screen.findByText(/Could not check balances/);
    expect(retireButton("Retire voucher").disabled).toBe(true);
  });

  it("clears the acknowledgement and shows the error when the server refuses", async () => {
    mocks.adminRetire.mockRejectedValue(new Error("Balances changed; acknowledge again"));
    const onClose = renderSheet();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(retireButton("Retire voucher"));

    expect((await screen.findByRole("alert")).textContent).toContain("Balances changed");
    await waitFor(() =>
      expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false"),
    );
    expect(retireButton("Retire voucher").disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a pending state and locks the sheet while retiring", async () => {
    mocks.preview.mockResolvedValue(
      preview({ amountOutsideOwnerRaw: "0", hasPositiveBalances: false }),
    );
    mocks.adminRetire.mockReturnValue(new Promise(() => {}));
    renderSheet();
    await screen.findByText("Other accounts hold 0 CARE.");
    fireEvent.click(retireButton("Retire voucher"));

    const pending = await screen.findByRole("button", { name: "Retiring…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(retireButton("Cancel").disabled).toBe(true);
  });

  it("closes on Escape and ignores a submit while the acknowledgement is missing", async () => {
    const onClose = renderSheet();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    const form = screen.getByRole("dialog").querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(mocks.adminRetire).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("cancels without retiring", async () => {
    const onClose = renderSheet();
    await screen.findByText("Other accounts hold 1.25 CARE.");
    fireEvent.click(retireButton("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.adminRetire).not.toHaveBeenCalled();
  });
});

function request(overrides: Partial<RetirementRequest> = {}): RetirementRequest {
  return {
    id: 4,
    resourceType: "voucher",
    source: "ADMIN",
    resourceAddress: ADDRESS,
    resourceName: "Care",
    symbol: "CARE",
    chainId: 100,
    requesterAddress: OWNER,
    ownerAddress: OWNER,
    reason: "",
    status: "approved",
    requestedAt: "2026-10-25T12:00:00Z",
    decisionAt: "2026-10-25T12:00:00Z",
    decisionBy: OWNER,
    decisionReason: null,
    snapshot: preview(),
    decisionSnapshot: null,
    ...overrides,
  };
}

describe("request source", () => {
  it("names who started a retirement", () => {
    expect(retirementSourceLabel("ADMIN")).toBe("Admin direct");
    expect(retirementSourceLabel("OWNER")).toBe("Owner request");
  });

  it("shows the source of each request in a resource's history", async () => {
    mocks.adminResourceHistory.mockResolvedValue({
      requests: [request(), request({ id: 5, source: "OWNER" })],
      events: [],
    });
    const { container } = renderWith(
      <RetirementResourceHistory type="voucher" address={ADDRESS} />,
    );
    const details = container.querySelector("details");
    if (!details) throw new Error("Expected retirement history details");
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(await screen.findByText("Admin direct")).toBeTruthy();
    expect(screen.getByText("Owner request")).toBeTruthy();
  });
});

describe("retire actions on the headers", () => {
  const voucher = (active: boolean) =>
    ({
      id: 1,
      name: "Care",
      address: ADDRESS,
      symbol: "CARE",
      kind: "voucher",
      chainId: 100,
      active,
      description: null,
      iconUrl: null,
      ownerAddress: OWNER,
    }) as unknown as MarketVoucherDetail;
  const pool = (active: boolean) =>
    ({
      id: 2,
      name: "Market pool",
      address: ADDRESS,
      symbol: "MKT",
      chainId: 100,
      active,
      imageUrl: null,
      voucherCount: 0,
      updatedAt: null,
      ownerAddress: OWNER,
    }) as unknown as UserPool;

  it("offers Retire voucher on an active voucher and Restore on a retired one", () => {
    const onRetire = vi.fn();
    const active = render(
      <VoucherHeader
        voucher={voucher(true)}
        onEdit={vi.fn()}
        onRestore={vi.fn()}
        onRetire={onRetire}
        onContract={vi.fn()}
        restoring={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire voucher" }));
    expect(onRetire).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    active.unmount();

    render(
      <VoucherHeader
        voucher={voucher(false)}
        onEdit={vi.fn()}
        onRestore={vi.fn()}
        onRetire={onRetire}
        onContract={vi.fn()}
        restoring={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retire voucher" })).toBeNull();
  });

  it("offers Retire pool on an active pool and Restore on a retired one", () => {
    const onRetire = vi.fn();
    const active = render(
      <PoolHeader
        pool={pool(true)}
        onAddVoucher={vi.fn()}
        onEditProfile={vi.fn()}
        onControls={vi.fn()}
        onRestore={vi.fn()}
        onRetire={onRetire}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire pool" }));
    expect(onRetire).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    active.unmount();

    render(
      <PoolHeader
        pool={pool(false)}
        onAddVoucher={vi.fn()}
        onEditProfile={vi.fn()}
        onControls={vi.fn()}
        onRestore={vi.fn()}
        onRetire={onRetire}
      />,
    );
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retire pool" })).toBeNull();
  });
});
