import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { publicProfileKeys } from "@clc/api/features/public-profiles/queries";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PublicProfileDesk } from "#/desktop/profiles/public-profile-desk";
import { PublicProfileContent } from "#/components/profile/public-profile-content";
import { ResourceProfileButton } from "#/components/profile/resource-profile-button";
import { PublicProfilePage } from "#/features/public-profiles/ui/public-profile-page";
import { stubIntersectionObserver } from "#/lib/-fixtures/intersection-observer";
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
    headers: status === 503 ? { "Retry-After": "0" } : undefined,
  });
const resourceKinds = {
  vouchers: "voucher",
  offers: "offer",
  wants: "want",
  pools: "pool",
  posts: "post",
  catalogs: "catalog",
} as const;
function defaultProfileResponse(input: string, value = profile) {
  const section = new URL(input).pathname.split("/").at(-1);
  return reply(
    section && section in resourceKinds ? { items: [], nextCursor: null } : { profile: value },
  );
}
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
  auth.session.address = address;
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
  it.each(["phone", "desktop"] as const)(
    "keeps the %s profile Message action available for both self and other recipients",
    async (view) => {
      auth.state = "authenticated";
      auth.isAuthenticated = true;
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) =>
          Promise.resolve(defaultProfileResponse(input, { ...profile, hasPrivateDetails: false })),
        ),
      );
      const { client } = mount(view);
      await screen.findByRole("heading", { name: "alice" });
      const target = () =>
        new URL(
          screen.getByRole("link", { name: "Message" }).getAttribute("href")!,
          window.location.origin,
        );
      expect(target().pathname).toBe("/");
      expect(target().searchParams.get("messageTo")).toBe(address);
      auth.session.address = other;
      client.setQueryData(publicProfileKeys.detail(address), {
        ...profile,
        hasPrivateDetails: false,
        bio: "Updated",
      });
      await screen.findByText("Updated");
      expect(target().searchParams.get("messageTo")).toBe(address);
      expect(target().searchParams.get("section")).toBe("messages");
    },
  );
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
        return Promise.resolve(defaultProfileResponse(input));
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
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v2/profiles/${address}`),
        expect.objectContaining({ credentials: "omit" }),
      );
      expect(await screen.findByRole("link", { name: "Community voucher" })).toBeTruthy();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${base}/vouchers?perPage=20`),
        expect.objectContaining({ credentials: "omit" }),
      );
    },
  );

  it.each(["phone", "desktop"] as const)(
    "renders the %s header, canonical Share and expanded resource sections",
    async (view) => {
      const fetch = vi.fn((input: string) => Promise.resolve(defaultProfileResponse(input)));
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
      const message = new URL(
        screen.getByRole("link", { name: "Message" }).getAttribute("href")!,
        window.location.origin,
      );
      expect(message.pathname).toBe("/onboarding");
      expect(message.searchParams.get("step")).toBe("signin");
      expect(message.searchParams.get("redirect")).toBe(
        `/?tab=activity&section=messages&messageTo=${address}`,
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(document.querySelectorAll("details[open]")).toHaveLength(6);
      expect(screen.queryByText("Transaction activity")).toBeNull();
      expect(fetch.mock.calls.some(([url]) => url.includes("/activity"))).toBe(false);
      expect(fetch.mock.calls.every(([url]) => !new URL(url).searchParams.has("cursor"))).toBe(
        true,
      );
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
          : defaultProfileResponse(url),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { client } = mount();
    await screen.findByRole("heading", { name: "alice" });
    expect(screen.getByLabelText("Checking your session…")).toBeTruthy();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/details"))).toHaveLength(0);
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
    const fetch = vi.fn((input: string) => Promise.resolve(defaultProfileResponse(input)));
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByText("We could not verify your session.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(auth.retry).toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/details"))).toHaveLength(0);
  });

  it.each(["phone", "desktop"] as const)(
    "distinguishes unavailable and failed %s profile reads and recovers",
    async (view) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(reply({}, 404))
        .mockResolvedValueOnce(reply({}, 503))
        .mockResolvedValueOnce(reply({}, 503))
        .mockResolvedValueOnce(reply({}, 503))
        .mockImplementation((input: string) => Promise.resolve(defaultProfileResponse(input)));
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
    let failures = 0;
    const fetch = vi.fn().mockImplementation((input: string) => {
      const url = new URL(input);
      const section = url.pathname.split("/").at(-1) as keyof typeof kinds;
      if (!kinds[section])
        return Promise.resolve(reply({ profile: { ...profile, hasPrivateDetails: false } }));
      if (failures > 0) {
        failures--;
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
      const summary = screen.getByText(label, { selector: "summary" });
      const section = summary.closest("details")!;
      const sectionView = within(section);
      expect(section.open).toBe(true);
      expect(await sectionView.findByText(`${key} one`)).toBeTruthy();
      if (key === "vouchers") {
        failures = 3;
        fireEvent.click(sectionView.getByRole("button", { name: "Load more" }));
        await screen.findByText("Couldn't load profile information.");
        expect(screen.getByText("vouchers one")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await screen.findByText("vouchers two");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
          fetch.mock.calls
            .filter(([input]) => new URL(input).pathname.endsWith("/vouchers"))
            .map(([input]) => new URL(input).searchParams.get("cursor")),
        ).toEqual([null, "second", "second", "second", "second"]);
        const img = document.querySelector('img[src="https://images.example/resource.png"]');
        if (img) fireEvent.error(img);
      }
      if (key === "pools") expect(screen.getByText("Multisig managed")).toBeTruthy();
      if (key === "wants") expect(sectionView.queryByText("CLC")).toBeNull();
      if (key === "catalogs") expect(sectionView.queryByText("Description")).toBeNull();
      fireEvent.click(screen.getByText(label, { selector: "summary" }));
    }
    expect(fetch.mock.calls.some(([url]) => url.includes("bbox"))).toBe(false);
  });

  it("opens only enabled sections and ignores legacy activity publication", async () => {
    const value = {
      ...profile,
      hasPrivateDetails: false,
      sections: {
        ...Object.fromEntries(Object.keys(resourceKinds).map((key) => [key, false])),
        vouchers: true,
        activity: true,
      },
    };
    const fetch = vi.fn((input: string) =>
      Promise.resolve(defaultProfileResponse(input, value as typeof profile)),
    );
    vi.stubGlobal("fetch", fetch);
    mount();
    await screen.findByText("No resources to show.");
    expect(document.querySelectorAll("details[open]")).toHaveLength(1);
    expect(screen.queryByText("Transaction activity")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.some(([url]) => url.includes("/activity"))).toBe(false);
  });

  it("reopens sections when changing profiles, including already cached profiles", async () => {
    const fetch = vi.fn(() => Promise.resolve(reply({ items: [], nextCursor: null })));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const first = { ...profile, hasPrivateDetails: false };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <PublicProfileContent profile={first} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("No resources to show.")).toHaveLength(6));
    const summary = screen.getByText("Offers", { selector: "summary" });
    fireEvent.click(summary);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(false));
    fireEvent.click(summary);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(true));
    fireEvent.click(summary);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(false));
    rerender(
      <QueryClientProvider client={client}>
        <PublicProfileContent profile={{ ...first, address: other }} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll("details[open]")).toHaveLength(6));
    rerender(
      <QueryClientProvider client={client}>
        <PublicProfileContent profile={first} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll("details[open]")).toHaveLength(6));
  });

  it("loads expanded sections independently while another section is pending", async () => {
    let resolveOffers!: (response: Response) => void;
    const fetch = vi.fn((input: string) => {
      if (new URL(input).pathname.endsWith("/offers"))
        return new Promise<Response>((resolve) => {
          resolveOffers = resolve;
        });
      return Promise.resolve(defaultProfileResponse(input));
    });
    vi.stubGlobal("fetch", fetch);
    mount();
    await waitFor(() => expect(screen.getAllByText("No resources to show.")).toHaveLength(5));
    const offers = within(screen.getByText("Offers", { selector: "summary" }).closest("details")!);
    expect(offers.getByLabelText("Loading…")).toBeTruthy();
    resolveOffers(reply({ items: [], nextCursor: null }));
    await offers.findByText("No resources to show.");
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it.each(["settles", "closes"] as const)(
    "starts viewport loading of later sections only after the first section %s",
    async (firstSection) => {
      const observer = stubIntersectionObserver();
      let resolveVouchers!: (response: Response) => void;
      const fetch = vi.fn((input: string, init: RequestInit) => {
        if (new URL(input).pathname.endsWith("/vouchers")) {
          return new Promise<Response>((resolve, reject) => {
            resolveVouchers = resolve;
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          });
        }
        return Promise.resolve(defaultProfileResponse(input));
      });
      vi.stubGlobal("fetch", fetch);
      mount();
      await screen.findByRole("heading", { name: "alice" });
      const vouchers = screen.getByText("Vouchers", { selector: "summary" });
      const voucherSection = vouchers.closest("details")!;
      await within(voucherSection).findByLabelText("Loading…");
      expect(document.querySelectorAll("details[open]")).toHaveLength(6);

      const requestedSections = () =>
        fetch.mock.calls.map(([url]) => new URL(url).pathname.split("/").at(-1));
      const offers = screen.getByText("Offers", { selector: "summary" });
      // A heading can briefly be in range while the preceding grid only shows a
      // spinner. Do not register its observer against that temporary geometry.
      act(() => observer.reveal(offers));
      expect(requestedSections()).toEqual([address, "vouchers"]);

      if (firstSection === "settles") {
        resolveVouchers(reply({ items: [], nextCursor: null }));
        await within(voucherSection).findByText("No resources to show.");
      } else {
        fireEvent.click(vouchers);
        await waitFor(() => {
          expect(voucherSection.open).toBe(false);
          expect(fetch.mock.calls[1]?.[1].signal?.aborted).toBe(true);
        });
      }

      act(() => observer.reveal(offers));
      await within(offers.closest("details")!).findByText("No resources to show.");
      expect(requestedSections()).toEqual([address, "vouchers", "offers"]);
    },
  );

  it("loads a deliberately reopened section while the first section is still pending", async () => {
    const observer = stubIntersectionObserver();
    const fetch = vi.fn((input: string) => {
      if (new URL(input).pathname.endsWith("/vouchers")) return new Promise<Response>(() => {});
      return Promise.resolve(defaultProfileResponse(input));
    });
    vi.stubGlobal("fetch", fetch);
    mount();

    const vouchers = await screen.findByText("Vouchers", { selector: "summary" });
    const voucherSection = within(vouchers.closest("details")!);
    await voucherSection.findByLabelText("Loading…");
    const offers = screen.getByText("Offers", { selector: "summary" });
    const offerSection = offers.closest("details")!;
    act(() => observer.reveal(offers));
    expect(offerSection.open).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(offers);
    await waitFor(() => expect(offerSection.open).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(offers);

    await within(offerSection).findByText("No resources to show.");
    expect(voucherSection.getByLabelText("Loading…")).toBeTruthy();
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname.split("/").at(-1))).toEqual([
      address,
      "vouchers",
      "offers",
    ]);
  });

  it("keeps published rows through an outage and does not restore them after withdrawal", async () => {
    let sectionStatus = 200;
    const fetch = vi.fn((input: string) => {
      if (!new URL(input).pathname.endsWith("/vouchers")) {
        return Promise.resolve(defaultProfileResponse(input));
      }
      return Promise.resolve(
        sectionStatus === 200
          ? reply({
              items: [{ id: 1, kind: "voucher", resourceId: other, name: "Published voucher" }],
              nextCursor: null,
            })
          : reply({}, sectionStatus),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const { client } = mount();
    await screen.findByRole("link", { name: "Published voucher" });
    const sectionKey = [...publicProfileKeys.detail(address), "resources", "vouchers"];
    const refreshSection = () => client.invalidateQueries({ queryKey: sectionKey });

    sectionStatus = 503;
    await act(refreshSection);
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Published voucher" })).toBeTruthy();

    sectionStatus = 404;
    await act(refreshSection);
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Published voucher" })).toBeNull(),
    );
    expect(client.getQueryData(sectionKey)).toMatchObject({ pages: [null] });

    sectionStatus = 503;
    await act(refreshSection);
    expect(screen.queryByRole("link", { name: "Published voucher" })).toBeNull();
  });

  it("recovers private-detail failures without fabricating data", async () => {
    Object.assign(auth, { state: "authenticated", isAuthenticated: true });
    let remainingFailures = 3;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/details")) {
          if (remainingFailures > 0) {
            remainingFailures--;
            return Promise.resolve(reply({}, 503));
          }
          return Promise.resolve(reply({ details: {} }));
        }
        return Promise.resolve(defaultProfileResponse(url));
      }),
    );
    mount();
    await screen.findByText("Couldn't load profile information.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByTestId("shared-pin")).toBeNull();
  });
});

describe("resource Profile action", () => {
  it("waits for current publication settings before using a cached single profile", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { client, router } = mount("chooser");
    client.setQueryData(publicProfileKeys.resource("pool", "1"), [
      { address, username: "Previously public" },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    await screen.findByLabelText("Loading…");
    expect(router.state.location.pathname).toBe("/");
    resolve(reply({ profiles: [] }));
    await screen.findByText("No public profile is available.");
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText("Previously public")).toBeNull();
  });
  it("cancels a closed profile lookup without navigating on a late response", async () => {
    let resolve!: (response: Response) => void;
    let signal!: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init: RequestInit) => {
        signal = init.signal!;
        return new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    );
    const { router } = mount("chooser");
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    await screen.findByLabelText("Loading…");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signal.aborted).toBe(true);
    resolve(reply({ profiles: [{ address }] }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("opens a single published profile directly instead of asking the user to choose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(reply({ profiles: [{ address, username: "alice" }] }))),
    );
    const { router } = mount("chooser");
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    await screen.findByText("Opened profile");
    expect(router.state.location.pathname).toBe(`/profiles/${address}`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
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
