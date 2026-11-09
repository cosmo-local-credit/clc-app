import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Edit profile across a browser zoom or window resize that crosses the desktop
 * breakpoint. Both views save through the same profile write; a save still in
 * flight when the phone page unmounts must keep the desktop Save busy, or a
 * second press writes the profile twice.
 */
const mocks = vi.hoisted(() => ({
  address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
  historyBack: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: mocks.historyBack } }),
  useCanGoBack: () => true,
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: mocks.address }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/components/ui/location-picker", () => ({ LocationPicker: () => <div /> }));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { ProfileDesk } from "#/desktop/account/profile-desk";
import { LayoutSwitch } from "#/desktop/switch";
import { ProfileEditPage } from "#/features/auth/ui/profile-edit-page";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

/** Reads answer at once; the one save answers only when the test says so. */
function mockBackend() {
  const stored = {
    address: mocks.address,
    name: "Alice",
    email: "alice@example.com",
    phone: "+254712345678",
    country: "KE",
    locationName: null,
    geoLat: null,
    geoLng: null,
    createdAt: "2026-07-01T12:20:29Z",
  };
  let answerSave!: () => void;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/profile") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      return new Promise((resolve) => {
        answerSave = () => resolve(jsonResponse({ ...stored, ...body }));
      });
    }
    if (url.includes("/auth/profile")) return Promise.resolve(jsonResponse(stored));
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    saves: () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").length,
    answerSave: () => answerSave(),
  };
}

function profile() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <LayoutSwitch mobile={<ProfileEditPage />} desktop={<ProfileDesk />} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  document.documentElement.dataset.layout = "mobile";
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
});

describe("Edit profile across a phone/desktop view switch", () => {
  it("keeps Save busy in the other view while the first press is still saving", async () => {
    const backend = mockBackend();
    render(profile());
    fireEvent.change(await screen.findByLabelText(/^name$/i), {
      target: { value: "Alice Cooper" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(backend.saves()).toBe(1));

    setViewport(true);

    const saving = (await screen.findByRole("button", { name: /saving/i })) as HTMLButtonElement;
    expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(saving.disabled).toBe(true);

    await act(async () => backend.answerSave());

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save changes/i }).getAttribute("aria-busy"),
      ).toBeNull(),
    );
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Alice C." } });
    expect(
      (screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(backend.saves()).toBe(1);
  });
});
