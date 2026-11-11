import type { UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ADDRESS = "0xd4A39D48B1F951F4D48e14dC64bCaF8f98c10151";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  authLoading: false,
  queryArgs: [] as unknown[],
  query: {
    data: { pages: [{ reports: [] as Record<string, unknown>[] }] },
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: mocks.authenticated,
    isLoading: mocks.authLoading,
  }),
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  usePoolReportsInfinite: (...args: unknown[]) => {
    mocks.queryArgs = args;
    return mocks.query;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, unknown>;
    search?: Record<string, unknown>;
  }) => (
    <a
      href="#test"
      data-to={to}
      data-params={params ? JSON.stringify(params) : undefined}
      data-search={search ? JSON.stringify(search) : undefined}
      {...props}
    >
      {children}
    </a>
  ),
}));

import { PoolPostsDesk } from "./pool-posts";

const pool = { chainId: 100, address: ADDRESS } as unknown as UserPool;

beforeEach(() => {
  mocks.authenticated = true;
  mocks.authLoading = false;
  mocks.queryArgs = [];
  mocks.query.data = { pages: [{ reports: [] }] };
  mocks.query.isPending = false;
  mocks.query.isError = false;
  mocks.query.isFetching = false;
  mocks.query.hasNextPage = false;
  mocks.query.isFetchingNextPage = false;
  mocks.query.refetch.mockReset();
  mocks.query.fetchNextPage.mockReset();
});

describe("PoolPostsDesk", () => {
  it("uses the Pool relationship feed and links View all to all related Posts", () => {
    mocks.query.data = {
      pages: [
        {
          reports: [
            {
              id: "42",
              title: "Community harvest",
              imageUrl: null,
              updatedAt: "2026-11-11T10:00:00Z",
            },
          ],
        },
      ],
    };

    render(<PoolPostsDesk pool={pool} />);

    expect(mocks.queryArgs).toEqual([{ chainId: 100, address: ADDRESS }, 3, true]);
    expect(screen.getByText("Community harvest")).toBeTruthy();
    const post = screen.getByRole("link", { name: /Community harvest/ });
    expect(post.getAttribute("data-to")).toBe("/posts/$reportId");
    expect(JSON.parse(post.getAttribute("data-params") ?? "{}")).toEqual({ reportId: "42" });

    const viewAll = screen.getByRole("link", { name: "View all" });
    expect(viewAll.getAttribute("data-to")).toBe("/");
    expect(JSON.parse(viewAll.getAttribute("data-search") ?? "{}")).toEqual({
      tab: "posts",
      timing: "all",
      pools: `100:${ADDRESS.toLowerCase()}`,
    });
  });

  it("keeps Posts protected for guests like the Voucher page", () => {
    mocks.authenticated = false;
    render(<PoolPostsDesk pool={pool} />);

    expect(mocks.queryArgs[2]).toBe(false);
    expect(screen.getByText("Sign in to view posts.")).toBeTruthy();
  });

  it("distinguishes pending authentication from a Pool without a chain reference", () => {
    mocks.authLoading = true;
    const pending = render(<PoolPostsDesk pool={pool} />);
    expect(screen.getByText("Loading posts…")).toBeTruthy();
    pending.unmount();

    mocks.authLoading = false;
    render(<PoolPostsDesk pool={{ ...pool, chainId: null }} />);
    expect(screen.getByText("Posts aren't available for this pool.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View all" })).toBeNull();
  });

  it("supports retry and pagination without hiding retained rows", () => {
    mocks.query.isError = true;
    const view = render(<PoolPostsDesk pool={pool} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.query.refetch).toHaveBeenCalledOnce();

    mocks.query.isError = false;
    mocks.query.hasNextPage = true;
    view.rerender(<PoolPostsDesk pool={pool} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.query.fetchNextPage).toHaveBeenCalledOnce();
  });
});
