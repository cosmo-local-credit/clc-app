import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock("qrcode", () => ({ default: qr }));

import { CollectDesk } from "./collect-desk";

const TOKEN = "0x1111111111111111111111111111111111111111";
const writeText = vi.fn();

async function mount(url: string) {
  const root = createRootRoute({ component: Outlet });
  const collect = createRoute({
    getParentRoute: () => root,
    path: "/wallet/collect",
    validateSearch: (search: Record<string, unknown>) => ({
      token: typeof search.token === "string" ? search.token : undefined,
    }),
    component: function Collect() {
      return <CollectDesk token={collect.useSearch().token} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([collect]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, name: "Collect" });
}

function handoffLink() {
  return screen.getByText(new RegExp(`^${window.location.origin}/wallet/collect`)).textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  qr.toDataURL.mockResolvedValue("data:image/png;base64,qr");
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Collect on the desktop", () => {
  it("says where Collect works and hands off to a QR and link for the same route", async () => {
    await mount(`/wallet/collect?token=${TOKEN}`);

    expect(
      screen.getByText("Open CLC in Chrome on Android to collect with an NFC card."),
    ).toBeTruthy();
    const link = `${window.location.origin}/wallet/collect?token=${TOKEN}`;
    expect(handoffLink()).toBe(link);
    await waitFor(() => expect(qr.toDataURL).toHaveBeenCalledWith(link, expect.anything()));
  });

  it("copies the link", async () => {
    await mount(`/wallet/collect?token=${TOKEN}`);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(handoffLink()));
  });

  it("carries only the route and a public token, never a key or a session", async () => {
    await mount(`/wallet/collect?token=${TOKEN}&key=0xdeadbeef&session=abc#secret`);

    const url = new URL(handoffLink() as string);
    expect(url.pathname).toBe("/wallet/collect");
    expect([...url.searchParams.keys()]).toEqual(["token"]);
    expect(url.hash).toBe("");
  });

  it("drops a token that is not a contract address", async () => {
    await mount("/wallet/collect?token=javascript:alert(1)");

    expect(handoffLink()).toBe(`${window.location.origin}/wallet/collect`);
  });
});
