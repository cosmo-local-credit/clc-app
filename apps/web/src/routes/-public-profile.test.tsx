import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { publicProfileKeys } from "@clc/api/features/public-profiles/queries";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PublicProfileDesk } from "#/desktop/profiles/public-profile-desk";
import { ResourceProfileButton } from "#/components/profile/resource-profile-button";
import { PublicProfilePage } from "#/features/public-profiles/ui/public-profile-page";
import { Route as ProfileRoute } from "./_nav/profiles/$address";

const address = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const other = `0x${"b".repeat(40)}`;
const auth = vi.hoisted(() => ({
  state: "guest",
  isAuthenticated: false,
  isLoading: false,
  session: { address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" },
  retrying: false,
  retry: vi.fn(),
  layout: "mobile" as "mobile" | "desktop",
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => auth }));
vi.mock("#/desktop/layout", () => ({ useLayout: () => auth.layout }));
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="shared-pin">
      {lat},{lng}
    </div>
  ),
}));

const profile = {
  address,
  username: "alice",
  avatarUrl: "https://images.example/avatar.png",
  name: "Alice",
  bio: "Community grower",
  website: "https://example.test",
  country: "KE",
  preferredCurrency: "KES",
  sections: {
    vouchers: true,
    offers: true,
    wants: true,
    pools: true,
    posts: true,
    catalogs: true,
    activity: true,
  },
  hasPrivateDetails: true,
};
const reply = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ ok: status < 400, result, description: "Unavailable" }), {
    status,
  });
const clients: QueryClient[] = [];
function mount(view: "phone" | "desktop" | "chooser" = "phone", kind: "pool" | "post" = "pool") {
  const root = createRootRoute();
  const start = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () =>
      view === "chooser" ? (
        <ResourceProfileButton kind={kind} resourceId="1" />
      ) : view === "phone" ? (
        <PublicProfilePage address={address} />
      ) : (
        <PublicProfileDesk address={address} />
      ),
  });
  const destination = createRoute({
    getParentRoute: () => root,
    path: "/profiles/$address",
    component: () => <p>Opened profile</p>,
  });
  const signin = createRoute({
    getParentRoute: () => root,
    path: "/onboarding",
    component: () => <p>Sign in page</p>,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: root.addChildren([start, destination, signin]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}
beforeEach(() => {
  Object.assign(auth, {
    state: "guest",
    isAuthenticated: false,
    isLoading: false,
    layout: "mobile",
  });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

describe("public profile views", () => {
  it.each(["mobile", "desktop"] as const)(
    "loads a lowercase shared URL and its Voucher section through the %s file route",
    async (layout) => {
      auth.layout = layout;
      const base = `/api/v2/profiles/${address}`;
      const fetch = vi.fn((input: string) => {
        const path = new URL(input).pathname;
        if (path === base) return Promise.resolve(reply({ profile }));
        if (path === `${base}/vouchers`)
          return Promise.resolve(
            reply({
              items: [{ id: "1", kind: "voucher", resourceId: other, name: "Community voucher" }],
              nextCursor: null,
            }),
          );
        return Promise.resolve(reply({}, 400));
      });
      vi.stubGlobal("fetch", fetch);
      const root = createRootRoute();
      const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
      const route = ProfileRoute.update({
        getParentRoute: () => root,
        path: "profiles/$address",
      } as never);
      const router = createRouter({
        routeTree: root.addChildren([home, route]),
        history: createMemoryHistory({ initialEntries: [`/profiles/${address.toLowerCase()}`] }),
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      clients.push(client);
      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );

      expect(await screen.findByRole("heading", { name: "alice" })).toBeTruthy();
      expect(router.state.location.pathname).toBe(`/profiles/${address.toLowerCase()}`);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`/api/v2/profiles/${address}`),
        expect.objectContaining({ credentials: "omit" }),
      );
      fireEvent.click(screen.getByText("Vouchers", { selector: "summary" }));
      expect(await screen.findByRole("link", { name: "Community voucher" })).toBeTruthy();
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining(`${base}/vouchers?perPage=20`),
        expect.objectContaining({ credentials: "omit" }),
      );
    },
  );

  it.each(["phone", "desktop"] as const)(
    "renders the %s header, canonical Share and only on-demand public sections",
    async (view) => {
      const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply({ profile })));
      vi.stubGlobal("fetch", fetch);
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { configurable: true, value: share });
      mount(view);
      expect(await screen.findByRole("heading", { name: "alice" })).toBeTruthy();
      expect(screen.getByText("Community grower")).toBeTruthy();
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("KE")).toBeTruthy();
      expect(screen.getByText("KES")).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "https://example.test" }).getAttribute("rel"),
      ).toContain("noopener");
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
      expect(fetch).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: "alice",
          url: `${window.location.origin}/profiles/${address}`,
        }),
      );
    },
  );

  it.each(["phone", "desktop"] as const)(
    "keeps hidden %s sections and unsafe websites absent",
    async (view) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          reply({
            profile: {
              ...profile,
              avatarUrl: null,
              username: null,
              name: null,
              bio: null,
              website: "javascript:alert(1)",
              country: null,
              preferredCurrency: null,
              hasPrivateDetails: false,
              sections: Object.fromEntries(
                Object.keys(profile.sections).map((key) => [key, false]),
              ),
            },
          }),
        ),
      );
      mount(view);
      expect(await screen.findByRole("heading", { name: "Public profile" })).toBeTruthy();
      expect(screen.queryByText("Contact and location")).toBeNull();
      expect(document.querySelector("summary")).toBeNull();
      expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    },
  );

  it.each(["phone", "desktop"] as const)(
    "uses the published name when the %s profile has no username",
    async (view) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          reply({
            profile: { ...profile, username: null, avatarUrl: null, hasPrivateDetails: false },
          }),
        ),
      );
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { configurable: true, value: share });
      mount(view);
      expect(await screen.findByRole("heading", { name: "Alice" })).toBeTruthy();
      expect(screen.queryByRole("img")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: "Public profile",
          url: `${window.location.origin}/profiles/${address}`,
        }),
      );
    },
  );

  it("loads only selected authenticated details and never starts them while session is unresolved", async () => {
    auth.state = "loading";
    auth.isLoading = true;
    const fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/details")
          ? reply({
              details: {
                email: "shared@example.test",
                phone: "+25400000",
                locationName: "Shared place",
                geoLat: -1.2,
                geoLng: 36.8,
              },
            })
          : reply({ profile }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { client } = mount();
    await screen.findByRole("heading", { name: "alice" });
    expect(screen.getByLabelText("Checking your session…")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    auth.state = "authenticated";
    auth.isLoading = false;
    auth.isAuthenticated = true;
    client.setQueryData(publicProfileKeys.detail(address), { ...profile, name: "Alice updated" });
    expect(await screen.findByText("shared@example.test")).toBeTruthy();
    expect(screen.getByText("+25400000")).toBeTruthy();
    expect(screen.getByText("Shared place")).toBeTruthy();
    expect(await screen.findByTestId("shared-pin")).toBeTruthy();
    const privateCall = fetch.mock.calls.find(([url]) => url.endsWith("/details"));
    expect(privateCall?.[1].credentials).toBe("include");
  });

  it("keeps session failures retryable without requesting details", async () => {
    Object.assign(auth, { state: "sessionCheckError" });
    const fetch = vi.fn().mockResolvedValue(reply({ profile }));
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByText("We could not verify your session.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(auth.retry).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["phone", "desktop"] as const)(
    "distinguishes unavailable and failed %s profile reads and recovers",
    async (view) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(reply({}, 404))
        .mockResolvedValueOnce(reply({}, 503))
        .mockImplementation(() => Promise.resolve(reply({ profile })));
      vi.stubGlobal("fetch", fetch);
      const { client } = mount(view);
      await screen.findByText("This public profile is unavailable.");
      await client.invalidateQueries();
      await screen.findByText("Couldn't load profile information.");
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await screen.findByRole("heading", { name: "alice" });
    },
  );

  it("lists every enabled resource kind, follows pagination and keeps rows during retry", async () => {
    const kinds = {
      vouchers: "voucher",
      offers: "offer",
      wants: "want",
      pools: "pool",
      posts: "post",
      catalogs: "catalog",
    } as const;
    let fail = false;
    const fetch = vi.fn().mockImplementation((input: string) => {
      const url = new URL(input);
      const section = url.pathname.split("/").at(-1) as keyof typeof kinds;
      if (!kinds[section])
        return Promise.resolve(reply({ profile: { ...profile, hasPrivateDetails: false } }));
      if (fail) {
        fail = false;
        return Promise.resolve(reply({}, 503));
      }
      const second = url.searchParams.has("cursor");
      return Promise.resolve(
        reply({
          items: [
            {
              id: second ? 2 : 1,
              kind: kinds[section],
              resourceId: address,
              name: `${section} ${second ? "two" : "one"}`,
              imageUrl: section === "vouchers" ? "https://images.example/resource.png" : null,
              description: section === "catalogs" ? null : "Description",
              symbol: section === "wants" ? null : "CLC",
              management: section === "pools" ? "multisig" : "direct",
            },
          ],
          nextCursor: second ? null : "second",
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByRole("heading", { name: "alice" });
    for (const [key, label] of Object.entries({
      vouchers: "Vouchers",
      offers: "Offers",
      wants: "Wants",
      pools: "Pools",
      posts: "Posts",
      catalogs: "Catalogs",
    })) {
      fireEvent.click(screen.getByText(label, { selector: "summary" }));
      expect(await screen.findByText(`${key} one`)).toBeTruthy();
      if (key === "vouchers") {
        fail = true;
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await screen.findByText("Couldn't load profile information.");
        expect(screen.getByText("vouchers one")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await screen.findByText("vouchers two");
        const img = document.querySelector('img[src="https://images.example/resource.png"]');
        if (img) fireEvent.error(img);
      }
      if (key === "pools") expect(screen.getByText("Multisig managed")).toBeTruthy();
      if (key === "wants") expect(screen.queryByText("CLC")).toBeNull();
      if (key === "catalogs") expect(screen.queryByText("Description")).toBeNull();
      fireEvent.click(screen.getByText(label, { selector: "summary" }));
    }
    expect(fetch.mock.calls.some(([url]) => url.includes("bbox"))).toBe(false);
  });

  it("shows an empty resource list and confirmed public Activity with pagination", async () => {
    const fetch = vi.fn().mockImplementation((input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/activity"))
        return Promise.resolve(
          reply({
            items: url.searchParams.has("cursor")
              ? []
              : [
                  {
                    id: "1",
                    txHash: `0x${"c".repeat(64)}`,
                    chainId: 100,
                    kind: "sent",
                    timestamp: "2026-11-23T00:00:00Z",
                  },
                  {
                    id: "2",
                    txHash: `0x${"d".repeat(64)}`,
                    chainId: 100,
                    kind: "other-indexed-event",
                    timestamp: "2026-11-23T00:00:00Z",
                  },
                ],
            nextCursor: url.searchParams.has("cursor") ? null : "two",
          }),
        );
      if (url.pathname.endsWith("/vouchers"))
        return Promise.resolve(reply({ items: [], nextCursor: null }));
      return Promise.resolve(reply({ profile: { ...profile, hasPrivateDetails: false } }));
    });
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByRole("heading", { name: "alice" });
    fireEvent.click(screen.getByText("Vouchers", { selector: "summary" }));
    await screen.findByText("No resources to show.");
    fireEvent.click(screen.getByText("Transaction activity", { selector: "summary" }));
    const link = await screen.findByRole("link", { name: /Sent/ });
    expect(link.getAttribute("href")).toContain("gnosisscan.io/tx/");
    expect(screen.getByRole("link", { name: /Transaction/ }).getAttribute("href")).toBe(
      `https://gnosisscan.io/tx/0x${"d".repeat(64)}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  });

  it("recovers private-detail and public Activity failures without fabricating data", async () => {
    Object.assign(auth, { state: "authenticated", isAuthenticated: true });
    let detailsFailed = false;
    let activityFailed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/details")) {
          if (!detailsFailed) {
            detailsFailed = true;
            return Promise.resolve(reply({}, 503));
          }
          return Promise.resolve(reply({ details: {} }));
        }
        if (url.includes("/activity?")) {
          if (!activityFailed) {
            activityFailed = true;
            return Promise.resolve(reply({}, 503));
          }
          return Promise.resolve(reply({ items: [], nextCursor: null }));
        }
        return Promise.resolve(reply({ profile }));
      }),
    );
    mount();
    await screen.findByText("Couldn't load profile information.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByTestId("shared-pin")).toBeNull();
    fireEvent.click(screen.getByText("Transaction activity", { selector: "summary" }));
    await screen.findByText("Couldn't load profile information.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No transactions to show.");
  });
});

describe("resource Profile action", () => {
  it("waits for an explicit click and includes the viewer's own profile among Safe signers", async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const { router } = mount("chooser");
    const button = await screen.findByRole("button", { name: "Profile" });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByLabelText("Loading…")).toBeTruthy();
    resolve(
      reply({
        profiles: [
          { address, username: "alice", avatarUrl: "https://images.example/me.png" },
          { address: other },
        ],
      }),
    );
    expect(await screen.findByRole("link", { name: "alice" })).toBeTruthy();
    expect(screen.getByRole("link", { name: other })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "alice" }));
    await screen.findByText("Opened profile");
    expect(router.state.location.pathname).toBe(`/profiles/${address}`);
    router.history.back();
    expect(await screen.findByRole("button", { name: "Profile" })).toBeTruthy();
  });
  it("keeps anonymous Post association unavailable, and offers Retry on a failed resolver", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({}, 503))
      .mockImplementation(() => Promise.resolve(reply({ profiles: [] })));
    vi.stubGlobal("fetch", fetch);
    mount("chooser", "post");
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    await screen.findByText("Couldn't load profile information.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No public profile is available.");
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
