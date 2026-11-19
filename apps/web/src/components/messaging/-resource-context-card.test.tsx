import { fireEvent, render, screen } from "@testing-library/react";
import type { MessageContextInput } from "@clc/core/features/messaging/logic";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const POOL = "0x1111111111111111111111111111111111111111";
const VOUCHER = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  pool: {} as Record<string, unknown>,
  voucher: {} as Record<string, unknown>,
  want: {} as Record<string, unknown>,
  catalog: {} as Record<string, unknown>,
  membership: {} as Record<string, unknown>,
  legacy: {} as Record<string, unknown>,
  registry: true,
  poolRefetch: vi.fn(),
  membershipRefetch: vi.fn(),
  legacyRefetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const resource = queryKey[1];
    if (resource === "vouchers") return mocks.voucher;
    if (resource === "wants") return mocks.want;
    if (resource === "catalogs") return mocks.catalog;
    return mocks.pool;
  },
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
          : to === "/vouchers/$voucherAddress"
            ? `/vouchers/${params?.voucherAddress}`
            : to === "/wants/$wantId"
              ? `/wants/${params?.wantId}`
              : `/catalogs/${params?.catalogId}`
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
  mocks.voucher = {};
  mocks.want = {};
  mocks.catalog = {};
});

describe("ResourceContextCard Pool proposals", () => {
  it.each([
    ["voucher", "Voucher:", "/vouchers/resource", "Voucher name"],
    ["want", "Want:", "/wants/resource", "Want name"],
    ["catalog", "Catalog:", "/catalogs/resource", "Catalog name"],
  ] as const)("links a %s context with its resource label", (kind, label, href, resourceName) => {
    render(<ResourceContextCard context={{ kind, resourceId: "resource", resourceName }} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("link", { name: resourceName }).getAttribute("href")).toBe(href);
  });

  it("renders a proposed voucher without an empty symbol suffix or owner action", () => {
    render(
      <ResourceContextCard
        context={{
          ...context,
          proposedVoucher: { address: VOUCHER, name: "Garden Voucher", symbol: "" },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Garden Voucher" })).toBeTruthy();
    expect(screen.queryByText("Approve voucher")).toBeNull();
  });

  it("resolves draft Pool and proposed Voucher display metadata", () => {
    mocks.pool = { ...mocks.pool, data: { address: POOL, name: "Resolved Pool" } };
    mocks.voucher = { data: { name: "Resolved Voucher", symbol: "RV" } };
    render(
      <ResourceContextCard
        context={{ kind: "pool", resourceId: POOL, proposedVoucherAddress: VOUCHER }}
      />,
    );
    expect(screen.getByRole("link", { name: "Resolved Pool" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Resolved Voucher (RV)" })).toBeTruthy();
  });

  it("falls back to draft identifiers while resource metadata is unavailable", () => {
    render(<ResourceContextCard context={{ kind: "pool", resourceId: POOL }} />);
    expect(screen.getByRole("link", { name: POOL })).toBeTruthy();
  });

  it.each([
    ["voucher", "Voucher name", "voucher"],
    ["want", "Want name", "want"],
    ["catalog", "Catalog name", "catalog"],
  ] as const)("resolves draft %s metadata", (kind, name, query) => {
    mocks[query] = { data: { name } };
    render(
      <ResourceContextCard context={{ kind, resourceId: "resource" } as MessageContextInput} />,
    );
    expect(screen.getByRole("link", { name })).toBeTruthy();
  });

  it("uses the proposed Voucher address when its metadata is unavailable", () => {
    mocks.pool = { ...mocks.pool, data: { address: POOL, name: "Resolved Pool" } };
    render(
      <ResourceContextCard
        context={{ kind: "pool", resourceId: POOL, proposedVoucherAddress: VOUCHER }}
      />,
    );
    expect(screen.getByRole("link", { name: VOUCHER })).toBeTruthy();
  });

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
