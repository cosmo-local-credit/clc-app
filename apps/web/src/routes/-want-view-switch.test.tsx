import type { Want } from "@clc/core/features/wants/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Create Want and Edit Want across a browser zoom or window resize that
 * crosses the desktop breakpoint. The real `LayoutSwitch` swaps the phone form
 * for the desktop editor; both run the same `useWantForm`, so what was typed
 * has to survive the swap, and only that.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  mine: vi.fn(),
  account: { address: undefined as string | undefined },
}));

const WANT: Want = {
  id: "7",
  name: "Bicycle repair",
  description: "Help repair a wheel",
  locationName: "Kisumu Market",
  geoLat: -0.0917,
  geoLng: 34.768,
  startsAt: "2026-10-24T08:00:00.000Z",
  expiresAt: null,
  status: "OPEN",
  state: "active",
  tags: ["Repair"],
  imageUrl: "https://storage.example/saved-picture.webp",
  markerIcon: "question",
  markerColor: "orange",
  contactPermission: 1,
  contactText: null,
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => mocks.navigate,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: mocks.account.address }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({
    data: {
      email: "amina@example.test",
      phone: "+254700000000",
      geoLat: -1.286,
      geoLng: 36.817,
      locationName: "Nairobi Market",
      country: "KE",
      avatarUrl: "https://storage.example/avatar.webp",
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { wants: { used: 0, limit: 3, unlimited: false, canCreate: true } },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Repair", "Transport"], isError: false }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));
vi.mock("#/lib/api/wants", () => ({
  wantsClient: {
    create: mocks.create,
    update: mocks.update,
    mine: mocks.mine,
    close: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("#/components/resource-usage", () => ({ ResourceUsage: () => null }));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <div>
      <output data-testid="want-image">{value ?? "marker"}</output>
      <button type="button" onClick={() => onChange("blob:https://app.test/fresh-upload")}>
        Add picture
      </button>
    </div>
  ),
}));
vi.mock("#/components/ui/tag-combobox", () => ({
  TagCombobox: ({
    value,
    onValueChange,
  }: {
    value: string[];
    onValueChange: (tags: string[]) => void;
  }) => (
    <div>
      <output data-testid="tags">{value.join(",")}</output>
      <button type="button" onClick={() => onValueChange(["Repair", "Transport"])}>
        Add Transport
      </button>
    </div>
  ),
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value?: { locationName: string };
    onChange: (value: { lat: number; lng: number; locationName: string; country: string }) => void;
  }) => (
    <div>
      <output data-testid="location">{value?.locationName ?? "none"}</output>
      <button
        type="button"
        onClick={() =>
          onChange({ lat: -4.0435, lng: 39.6682, locationName: "Mombasa", country: "KE" })
        }
      >
        Choose Mombasa
      </button>
    </div>
  ),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({ LocationMap: () => <div /> }));

import { LayoutSwitch } from "#/desktop/switch";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { WantFormDesk } from "#/desktop/wants/want-form-desk";
import { WantFormPage } from "#/features/wants/ui/want-form-page";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const ALICE = "0xAbC0000000000000000000000000000000000001";
const BOB = "0xB0b0000000000000000000000000000000000002";

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

function editor(id?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutSwitch mobile={<WantFormPage id={id} />} desktop={<WantFormDesk wantId={id} />} />
    </QueryClientProvider>
  );
}

const entries = () => useViewDraftStore.getState().entries;
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const change = (label: string, next: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: next } });

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  mocks.account.address = ALICE;
  mocks.create.mockResolvedValue(WANT);
  mocks.update.mockResolvedValue(WANT);
  mocks.navigate.mockResolvedValue(undefined);
  mocks.mine.mockResolvedValue({ wants: [WANT], first: 7, last: 7 });
  clearViewDrafts();
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
  clearViewDrafts();
});

describe("Create Want across a phone/desktop view switch", () => {
  it("brings every typed field to the other view, and back again", async () => {
    render(editor());
    change("Name", "Wheel repair");
    change("Description", "Need a spoke replaced");
    change("Starts", "2026-12-01T10:00");
    fireEvent.click(screen.getByRole("checkbox", { name: "No ending date" }));
    change("Ends", "2026-12-05T10:00");
    fireEvent.click(screen.getByRole("button", { name: "Add Transport" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Mombasa" }));
    change("Contact instructions", "Meet at the market");
    fireEvent.click(screen.getByRole("checkbox", { name: "Share my email" }));
    fireEvent.click(screen.getByRole("radio", { name: "Message" }));

    setViewport(true);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Create Want" })).toBeTruthy());
    expect(value("Name")).toBe("Wheel repair");
    expect(value("Description")).toBe("Need a spoke replaced");
    expect(value("Starts")).toBe("2026-12-01T10:00");
    expect(value("Ends")).toBe("2026-12-05T10:00");
    expect(screen.getByTestId("tags").textContent).toBe("Repair,Transport");
    expect(screen.getByTestId("location").textContent).toBe("Mombasa");
    expect(value("Contact instructions")).toBe("Meet at the market");
    expect(
      screen.getByRole("checkbox", { name: "Share my email" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("radio", { name: "Message" }).getAttribute("aria-checked")).toBe(
      "true",
    );

    change("Name", "Wheel repair, urgent");
    setViewport(false);
    expect(value("Name")).toBe("Wheel repair, urgent");
    expect(value("Ends")).toBe("2026-12-05T10:00");
  });

  it("does not bring a picture across: an upload is a file in flight, not a field", () => {
    render(editor());
    change("Name", "Wheel repair");
    fireEvent.click(screen.getByRole("button", { name: "Add picture" }));
    expect(screen.getByTestId("want-image").textContent).toBe("blob:https://app.test/fresh-upload");

    setViewport(true);

    expect(value("Name")).toBe("Wheel repair");
    expect(screen.getByTestId("want-image").textContent).toBe("marker");
    expect(JSON.stringify(entries())).not.toMatch(/blob:|storage\.example/);
  });

  it("does not bring the draft back after the person leaves and returns in the other layout", () => {
    openViewport(false);
    const first = render(editor());
    change("Name", "Abandoned");

    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(editor());

    expect(value("Name")).toBe("");
  });

  it("keeps nothing while the form is as it opened, or is back to that", () => {
    render(editor());
    expect(entries()).toEqual({});

    change("Name", "Wheel repair");
    expect(Object.keys(entries())).toHaveLength(1);
    change("Name", "");
    expect(entries()).toEqual({});
  });

  it("is scoped to the account", () => {
    render(editor());
    change("Name", "Alice's want");

    mocks.account.address = BOB;
    setViewport(true);

    expect(value("Name")).toBe("");
  });

  it("keeps nothing for a guest", () => {
    mocks.account.address = undefined;
    render(editor());
    change("Name", "Typed while signed out");
    expect(entries()).toEqual({});

    setViewport(true);

    expect(value("Name")).toBe("");
  });

  it("forgets the draft once the Want is saved", async () => {
    render(editor());
    change("Name", "Wheel repair");
    change("Description", "Need a spoke replaced");
    change("Contact instructions", "Meet at the market");
    expect(Object.keys(entries())).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Create Want" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(entries()).toEqual({});
  });
});

describe("Edit Want across a phone/desktop view switch", () => {
  it("carries edits to the other view, on top of the loaded Want", async () => {
    render(editor("7"));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("Kisumu Market"));
    change("Name", "Bicycle repair, now with brakes");

    setViewport(true);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit Want" })).toBeTruthy());
    expect(value("Name")).toBe("Bicycle repair, now with brakes");
    expect(value("Description")).toBe("Help repair a wheel");
    expect(screen.getByTestId("location").textContent).toBe("Kisumu Market");
    // The saved picture is the Want's own; a swap neither drops nor replaces it.
    expect(screen.getByTestId("want-image").textContent).toBe(
      "https://storage.example/saved-picture.webp",
    );
    expect(Object.keys(entries())).toEqual([`${ALICE.toLowerCase()}:want-edit:7`]);
  });

  it("never shows an edit's draft in Create Want, or in the edit of another Want", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LayoutSwitch mobile={<WantFormPage id="7" />} desktop={<WantFormDesk />} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("Kisumu Market"));
    change("Name", "Edited name");

    setViewport(true);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Create Want" })).toBeTruthy());
    expect(value("Name")).toBe("");
  });
});
