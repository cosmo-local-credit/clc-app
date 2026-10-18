import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  PoolSuggestion,
  VoucherSuggestion,
} from "#/features/home/hooks/use-market-search-suggestions";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const OWNER = "0xabc0000000000000000000000000000000000123";
const VOUCHER = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  suggestions: {
    tags: [] as string[],
    vouchers: [] as unknown[],
    pools: [] as unknown[],
  },
  drafts: [] as string[],
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
    params?: Record<string, string>;
    search?: Record<string, string>;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to,
    );
    const query = new URLSearchParams(search ?? {}).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => OWNER,
}));

vi.mock("#/features/home/hooks/use-market-search-suggestions", () => ({
  useMarketSearchSuggestions: (draft: string) => {
    mocks.drafts.push(draft);
    return mocks.suggestions;
  },
}));

import { rememberSearch } from "#/features/home/api/recent-search-storage";
import { MarketSearchField, MarketSearchScreen } from "./market-search";

function makeFilter(overrides: Partial<CatalogFilterControls> = {}) {
  return {
    term: "",
    setTerm: vi.fn(),
    clearTerm: vi.fn(),
    tags: [],
    isAtTagLimit: false,
    ...overrides,
  } as unknown as CatalogFilterControls;
}

function renderScreen(filter = makeFilter()) {
  const onClose = vi.fn();
  const onApplyTags = vi.fn();
  render(
    <MarketSearchScreen
      onClose={onClose}
      filter={filter}
      label="Search the marketplace"
      onApplyTags={onApplyTags}
    />,
  );
  return { filter, onClose, onApplyTags, dialog: screen.getByRole("dialog") };
}

function type(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Search the marketplace" }), {
    target: { value },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.suggestions = { tags: [], vouchers: [], pools: [] };
  mocks.drafts = [];
});

describe("MarketSearchField", () => {
  it("shows the applied search and opens the screen on a tap", () => {
    const onOpen = vi.fn();
    const filter = makeFilter({ term: "bike" });
    render(<MarketSearchField filter={filter} label="Search the marketplace" onOpen={onOpen} />);

    const field = screen.getByRole("button", { name: "Search the marketplace bike" });
    fireEvent.click(field);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(filter.clearTerm).toHaveBeenCalledTimes(1);
  });
});

describe("MarketSearchScreen", () => {
  it("offers recent searches and tags at rest", () => {
    rememberSearch(OWNER, "maize");
    rememberSearch(OWNER, "bike repair");
    mocks.suggestions = { ...mocks.suggestions, tags: ["Food", "Repair"] };
    const { dialog, filter, onClose } = renderScreen();

    const recent = within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(recent).toEqual(["bike repair", "maize"]);
    expect(within(dialog).getByRole("button", { name: "Food" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "maize" }));
    expect(filter.setTerm).toHaveBeenCalledWith("maize");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts from the applied search and searches on Enter, remembering it", () => {
    const { dialog, filter, onClose } = renderScreen(makeFilter({ term: "bik" }));
    const input = within(dialog).getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("bik");

    type("  bike  ");
    fireEvent.submit(within(dialog).getByRole("search"));

    expect(filter.setTerm).toHaveBeenCalledWith("bike");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(`clc.t.${OWNER}.market.recent-searches.v1`)).toBe(
      JSON.stringify(["bike"]),
    );
  });

  it("suggests vouchers, pools and tags that match as you type", () => {
    mocks.suggestions = {
      tags: ["Food", "Farming", "Repair"],
      vouchers: [
        {
          kind: "voucher",
          id: "1",
          name: "Farm Fresh",
          address: VOUCHER,
          symbol: "FRM",
          imageUrl: null,
          locationName: "Kilifi",
        } as unknown as VoucherSuggestion,
      ],
      pools: [
        {
          kind: "pool",
          id: "2",
          name: "Farmers Pool",
          address: POOL,
          imageUrl: null,
          locationName: "Mnarani",
        } as unknown as PoolSuggestion,
      ],
    };
    const { dialog, onApplyTags, onClose } = renderScreen(makeFilter({ tags: ["Food"] } as never));

    type("far");

    expect(within(dialog).getByRole("button", { name: "Search “far”" })).toBeTruthy();
    const voucher = within(dialog).getByRole("link", { name: /Farm Fresh/ });
    expect(voucher.getAttribute("href")).toBe(`/vouchers/${VOUCHER}?from=market`);
    const pool = within(dialog).getByRole("link", { name: /Farmers Pool/ });
    expect(pool.getAttribute("href")).toBe(`/pools/${POOL}`);
    expect(pool.textContent).toContain("Pool · Mnarani");
    expect(within(dialog).queryByRole("button", { name: "Repair" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Farming" }));
    expect(onApplyTags).toHaveBeenCalledWith(["Food", "Farming"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from Back without touching the search", () => {
    const { dialog, filter, onClose } = renderScreen();

    type("bike");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(filter.setTerm).not.toHaveBeenCalled();
  });

  it("clears the draft, restores focus, and runs the visible search suggestion", () => {
    const { dialog, filter, onClose } = renderScreen();
    const input = within(dialog).getByRole("searchbox") as HTMLInputElement;

    type("bike");
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);

    type("bike");
    fireEvent.click(within(dialog).getByRole("button", { name: "Search “bike”" }));
    expect(filter.setTerm).toHaveBeenCalledWith("bike");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the dialog is dismissed with Escape", () => {
    const { dialog, onClose } = renderScreen();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not add a tag that is already applied", () => {
    mocks.suggestions = { ...mocks.suggestions, tags: ["Food"] };
    const { dialog, onApplyTags, onClose } = renderScreen(makeFilter({ tags: ["Food"] } as never));

    fireEvent.click(within(dialog).getByRole("button", { name: "Food" }));

    expect(onApplyTags).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
