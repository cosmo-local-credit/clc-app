import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePaletteStore } from "#/desktop/palette-store";

import { renderInShell } from "./-shell-test-router";
import { CommandPalette } from "./command-palette";
import { useShortcutHelp } from "./shortcut-help";

const AMINA = "0x1111111111111111111111111111111111111111";
const TEA_POOL = "0x2222222222222222222222222222222222222222";
const TEA_VOUCHER = "0x3333333333333333333333333333333333333333";

const recipients = vi.hoisted(() => ({ search: vi.fn() }));
const marketplace = vi.hoisted(() => ({ list: vi.fn() }));
const usageState = vi.hoisted(() => ({
  data: undefined as
    | undefined
    | Record<"vouchers" | "pools" | "catalogs" | "wants" | "offers", { canCreate: boolean }>,
}));

vi.mock("#/lib/api/recipients", () => ({ recipientsClient: recipients }));
vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: marketplace }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({ data: usageState.data }),
}));

function allowed(...kinds: ("vouchers" | "pools" | "catalogs")[]) {
  const can = (kind: string) => ({ canCreate: kinds.some((entry) => entry === kind) });
  usageState.data = {
    vouchers: can("vouchers"),
    pools: can("pools"),
    catalogs: can("catalogs"),
    wants: can("wants"),
    offers: can("offers"),
  };
}

const person = {
  kind: "user" as const,
  name: "Amina Otieno",
  alias: "amina",
  address: AMINA,
  chainId: 100,
};
const pool = {
  kind: "pool" as const,
  name: "Tea Pool",
  alias: "teapool",
  address: TEA_POOL,
  chainId: 100,
};
const teaVoucher = { kind: "voucher", id: "v1", name: "Tea voucher", address: TEA_VOUCHER };

beforeEach(() => {
  recipients.search.mockReset().mockResolvedValue([person, pool]);
  marketplace.list.mockReset().mockResolvedValue({ results: [teaVoucher], nextCursor: null });
  usageState.data = undefined;
  usePaletteStore.setState({ open: false });
  useShortcutHelp.setState({ open: false });
});

async function openPalette(url = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePaletteStore.setState({ open: true });
  const view = await renderInShell(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
    url,
  );
  const input = await screen.findByRole("combobox", { name: "Search the marketplace" });
  return { ...view, input };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function options() {
  return screen.getAllByRole("option");
}

function activeOption(input: HTMLElement) {
  const id = input.getAttribute("aria-activedescendant");
  return options().find((option) => option.id === id);
}

describe("keyboard navigation", () => {
  it("keeps focus in the input while Up and Down move a visible active result", async () => {
    const { input } = await openPalette();
    type(input, "tea");
    await screen.findByRole("option", { name: /Tea voucher/ });

    const labels = () => options().map((option) => option.textContent);
    expect(labels()).toEqual([
      expect.stringContaining("Send to amina"),
      expect.stringContaining("Open pool Tea Pool (teapool)"),
      expect.stringContaining("Tea voucher"),
      expect.stringContaining("See all results for “tea”"),
    ]);

    // The first result is active before any key: Enter works at once.
    expect(activeOption(input)?.textContent).toContain("Send to amina");
    expect(
      options().filter((option) => option.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOption(input)?.textContent).toContain("Open pool");
    expect(activeOption(input)?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOption(input)?.textContent).toContain("See all results");
    // Past the last result it wraps to the first, and Up wraps the other way.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOption(input)?.textContent).toContain("Send to amina");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOption(input)?.textContent).toContain("See all results");

    expect(document.activeElement).toBe(input);
  });

  it("runs the active result with Enter and closes", async () => {
    const { input, router } = await openPalette();
    type(input, "tea");
    await screen.findByRole("option", { name: /Tea voucher/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/vouchers/${TEA_VOUCHER}`);
    });
    expect(usePaletteStore.getState().open).toBe(false);
  });

  it("closes with Escape", async () => {
    const { input } = await openPalette();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(usePaletteStore.getState().open).toBe(false);
    });
  });

  it("restarts at the first result when the query changes", async () => {
    const { input } = await openPalette();
    type(input, "tea");
    await screen.findByRole("option", { name: /Tea voucher/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    type(input, "teas");
    await waitFor(() => {
      expect(activeOption(input)?.textContent).toContain("Send to amina");
    });
  });
});

describe("results", () => {
  it("are grouped Actions, People and Marketplace, and name what a person row does", async () => {
    const { input } = await openPalette();
    type(input, "se");
    await screen.findByRole("option", { name: /Tea voucher/ });

    const groups = screen.getAllByRole("group");
    expect(
      groups
        .map((group) => group.getAttribute("aria-labelledby"))
        .map((id) => document.getElementById(id ?? "")?.textContent),
    ).toEqual(["Actions", "People", "Marketplace"]);
    expect(
      within(groups[0] as HTMLElement)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Send", "Settings"]);
    expect(
      within(groups[1] as HTMLElement).getByRole("option", { name: /Send to amina/ }),
    ).toBeTruthy();
    // A pool is opened, not paid.
    expect(
      within(groups[1] as HTMLElement).getByRole("option", { name: /Open pool/ }),
    ).toBeTruthy();
  });

  it("sends a person row to Send with that address", async () => {
    const { input, router } = await openPalette();
    type(input, "amina");
    fireEvent.click(await screen.findByRole("option", { name: /Send to amina/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/wallet/send");
    });
    expect(router.state.location.search).toMatchObject({ to: AMINA });
  });

  it("leads to the full results on the list, with the query", async () => {
    const { input, router } = await openPalette("/market?scope=offers&view=map");
    type(input, "tea");
    fireEvent.click(await screen.findByRole("option", { name: /See all results for “tea”/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/market");
    });
    expect(router.state.location.search).toMatchObject({ scope: "all", view: "list", q: "tea" });
  });
});

describe("create actions", () => {
  it("are hidden until the allowance says the person can create", async () => {
    recipients.search.mockResolvedValue([]);
    marketplace.list.mockResolvedValue({ results: [], nextCursor: null });
    const { input } = await openPalette();
    type(input, "create");
    await screen.findByText("No matches");
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("offer only the resources the person may create", async () => {
    allowed("pools", "catalogs");
    recipients.search.mockResolvedValue([]);
    marketplace.list.mockResolvedValue({ results: [], nextCursor: null });
    const { input, router } = await openPalette();
    type(input, "create");
    await waitFor(() => {
      expect(options().map((option) => option.textContent)).toEqual([
        "Create pool",
        "Create catalog",
      ]);
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/catalogs/create");
    });
  });

  it("offer Create voucher when vouchers are allowed", async () => {
    allowed("vouchers");
    recipients.search.mockResolvedValue([]);
    marketplace.list.mockResolvedValue({ results: [], nextCursor: null });
    const { input } = await openPalette();
    type(input, "create");
    await waitFor(() => {
      expect(options().map((option) => option.textContent)).toEqual(["Create voucher"]);
    });
  });
});

describe("search status", () => {
  it("says it is searching while results load, and keeps the actions usable", async () => {
    recipients.search.mockReturnValue(new Promise(() => undefined));
    marketplace.list.mockReturnValue(new Promise(() => undefined));
    const { input } = await openPalette();
    type(input, "se");
    expect((await screen.findByRole("status")).textContent).toContain("Searching…");
    expect(screen.getByRole("option", { name: "Send" })).toBeTruthy();
  });

  it("says when nothing matches", async () => {
    recipients.search.mockResolvedValue([]);
    marketplace.list.mockResolvedValue({ results: [], nextCursor: null });
    const { input } = await openPalette();
    type(input, "zzzz");
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("No matches");
    });
    expect(screen.queryByRole("option")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("reports a failed search and retries it", async () => {
    recipients.search.mockRejectedValueOnce(new Error("offline"));
    const { input } = await openPalette();
    type(input, "tea");

    expect(await screen.findByText("Search failed")).toBeTruthy();
    // What did load stays in front of the person.
    expect(screen.getByRole("option", { name: /Tea voucher/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: /Send to amina/ })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("Search failed")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("the combobox contract", () => {
  it("points the input at its listbox and the active option", async () => {
    const { input } = await openPalette();
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByRole("listbox", { name: "Results" });
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(listbox.contains(activeOption(input) ?? null)).toBe(true);
  });

  it("opens the shortcut list from its action", async () => {
    const { input } = await openPalette();
    type(input, "shortcuts");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(useShortcutHelp.getState().open).toBe(true);
    });
    expect(usePaletteStore.getState().open).toBe(false);
  });
});
