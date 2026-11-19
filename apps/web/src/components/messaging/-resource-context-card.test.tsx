import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const POOL = "0x1111111111111111111111111111111111111111";
const VOUCHER = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  pool: {} as Record<string, unknown>,
  membership: {} as Record<string, unknown>,
  legacy: {} as Record<string, unknown>,
  registry: true,
  poolRefetch: vi.fn(),
  membershipRefetch: vi.fn(),
  legacyRefetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => mocks.pool,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={
        to === "/pools/$poolAddress"
          ? `/pools/${params?.poolAddress}`
          : `/vouchers/${params?.voucherAddress}`
      }
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
  usePoolTokenMembership: () => mocks.membership,
  poolTokenRegistryAddress: () =>
    mocks.registry ? "0x3333333333333333333333333333333333333333" : null,
}));
vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersWithStatus: () => mocks.legacy,
}));

import { ResourceContextCard } from "./resource-context-card";

const context = {
  kind: "pool" as const,
  resourceId: POOL,
  resourceName: "Community Pool",
  proposedVoucher: {
    address: VOUCHER,
    name: "Garden Voucher",
    symbol: "GARD",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registry = true;
  mocks.pool = {
    data: { address: POOL },
    isPending: false,
    isSuccess: true,
    isError: false,
    refetch: mocks.poolRefetch,
  };
  mocks.membership = {
    data: false,
    isPending: false,
    isError: false,
    refetch: mocks.membershipRefetch,
  };
  mocks.legacy = {
    vouchers: [],
    isPending: false,
    isError: false,
    refetch: mocks.legacyRefetch,
  };
});

describe("ResourceContextCard Pool proposals", () => {
  it("shows the authoritative approved state instead of an action", () => {
    mocks.membership = { ...mocks.membership, data: true };
    render(<ResourceContextCard context={context} approve />);
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.queryByText("Approve voucher")).toBeNull();
  });

  it("shows checking and then the approval destination", () => {
    mocks.membership = { ...mocks.membership, isPending: true };
    const { rerender } = render(<ResourceContextCard context={context} approve />);
    expect(screen.getByRole("button", { name: "Checking approval…" })).toBeTruthy();

    mocks.membership = { ...mocks.membership, isPending: false };
    rerender(<ResourceContextCard context={context} approve />);
    expect(screen.getByRole("link", { name: "Approve voucher" }).getAttribute("href")).toBe(
      `/pools/${POOL}`,
    );
  });

  it("retries the failed Pool read", () => {
    mocks.pool = {
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: true,
      refetch: mocks.poolRefetch,
    };
    render(<ResourceContextCard context={context} approve />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.poolRefetch).toHaveBeenCalled();
  });

  it("retries registry membership independently", () => {
    mocks.membership = { ...mocks.membership, isError: true };
    render(<ResourceContextCard context={context} approve />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.membershipRefetch).toHaveBeenCalled();
  });

  it("uses and retries the complete legacy catalog", () => {
    mocks.registry = false;
    mocks.membership = { ...mocks.membership, data: undefined };
    mocks.legacy = { ...mocks.legacy, isError: true };
    const { rerender } = render(<ResourceContextCard context={context} approve />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.legacyRefetch).toHaveBeenCalled();

    mocks.legacy = {
      ...mocks.legacy,
      isError: false,
      vouchers: [{ tokenAddress: VOUCHER.toUpperCase() }],
    };
    rerender(<ResourceContextCard context={context} approve />);
    expect(screen.getByText("Approved")).toBeTruthy();
  });
});
