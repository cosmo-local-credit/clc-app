import { BackendApiError } from "@clc/api/client/errors";
import { regionKeys } from "@clc/api/features/regions/queries";
import type { Region } from "@clc/core/features/regions/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { MyRegions } from "./my-regions";

const { myRegions } = vi.hoisted(() => ({ myRegions: vi.fn() }));
vi.mock("#/lib/api/regions", () => ({ regionsClient: { myRegions } }));
vi.mock("./region-map", () => ({
  RegionMap: ({ region }: { region: Region }) => <div>Map of {region.name}</div>,
}));

const VIEWER = "0xabc";
const SECOND_VIEWER = "0xdef";
const bhutan: Region = {
  id: "bt",
  name: "Bhutan",
  countryCode: "BTN",
  active: true,
  revision: 1,
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [89, 27],
        [90, 27],
        [90, 28],
        [89, 27],
      ],
    ],
  },
  poolApproval: true,
  assignedAdmins: [],
};

function view(viewer?: string, client = new QueryClient()) {
  return (
    <QueryClientProvider client={client}>
      <MyRegions viewer={viewer} />
    </QueryClientProvider>
  );
}

beforeEach(() => myRegions.mockReset());

describe("My regions", () => {
  it("does not query without a regional-admin viewer", () => {
    render(view());
    expect(screen.getByText("No active regions are assigned to you.")).toBeTruthy();
    expect(myRegions).not.toHaveBeenCalled();
  });

  it("lists only active assignments and lets the operator switch the displayed boundary", async () => {
    myRegions.mockResolvedValue([
      bhutan,
      { ...bhutan, id: "ke", name: "Kenya", countryCode: "KEN" },
      { ...bhutan, id: "inactive", name: "Inactive region", active: false },
    ]);
    render(view(VIEWER));
    expect(screen.getByRole("status").textContent).toContain("Loading");
    await screen.findByText("Map of Bhutan");
    expect(screen.getByRole("button", { name: "Bhutan", pressed: true })).toBeTruthy();
    expect(screen.queryByText("Inactive region")).toBeNull();
    const kenya = screen.getByRole("button", { name: "Kenya", pressed: false });
    fireEvent.click(kenya);
    expect(kenya.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Map of Kenya")).toBeTruthy();
  });

  it("never shows the former wallet's assignments and can recover from an API error", async () => {
    myRegions
      .mockResolvedValueOnce([bhutan])
      .mockRejectedValueOnce(new BackendApiError(403, "Unavailable"))
      .mockResolvedValueOnce([]);
    const client = new QueryClient();
    const { rerender } = render(view(VIEWER, client));
    await screen.findByText("Map of Bhutan");
    rerender(view(SECOND_VIEWER, client));
    expect(screen.queryByText("Bhutan")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't load your regions.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No active regions are assigned to you.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("waits for scope revalidation instead of presenting cached assignments", async () => {
    myRegions.mockResolvedValueOnce([]);
    const client = new QueryClient();
    client.setQueryData(regionKeys.mine(VIEWER), [bhutan], { updatedAt: 1 });
    render(view(VIEWER, client));
    expect(screen.queryByText("Bhutan")).toBeNull();
    expect(await screen.findByText("No active regions are assigned to you.")).toBeTruthy();
  });
});
