import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { MarketViewportSearchNotice } from "./market-viewport-search-notice";

const mocks = vi.hoisted(() => ({
  discovery: undefined as
    | {
        nearby: boolean;
        scope: string;
        bounds?: readonly {
          minLng: number;
          minLat: number;
          maxLng: number;
          maxLat: number;
        }[];
      }
    | undefined,
}));

vi.mock("#/components/nearby-catalog", () => ({
  useNearbyCatalog: () => mocks.discovery,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search: (previous: unknown) => unknown;
  }) => (
    <a
      href={to}
      data-search={JSON.stringify(
        search({
          q: "bread",
          tags: ["food"],
          tagMatch: "all",
          creditable: true,
          scope: "offers",
          out_voucher: `0x${"1".repeat(40)}`,
        }),
      )}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mocks.discovery = undefined;
});

afterEach(cleanup);

it("stays absent for Global discovery and an empty text search", () => {
  const view = render(<MarketViewportSearchNotice query="bread" />);
  expect(screen.queryByText(/Search results use/)).toBeNull();

  mocks.discovery = {
    nearby: false,
    scope: "viewport:guest:box",
    bounds: [{ minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 }],
  };
  view.rerender(<MarketViewportSearchNotice query="  " />);
  expect(screen.queryByText(/Search results use/)).toBeNull();
});

it("links a bounded text search back to the map with only compatible search state", () => {
  mocks.discovery = {
    nearby: false,
    scope: "viewport:guest:box",
    bounds: [{ minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 }],
  };
  render(<MarketViewportSearchNotice query="bread" />);

  const link = screen.getByRole("link", { name: "map" });
  expect(link.getAttribute("href")).toBe("/");
  expect(JSON.parse(link.getAttribute("data-search") ?? "null")).toEqual({
    q: "bread",
    tags: ["food"],
    tagMatch: "all",
    creditable: true,
  });
});
