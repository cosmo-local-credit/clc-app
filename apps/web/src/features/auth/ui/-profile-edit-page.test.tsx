import type { LocationInput } from "@clc/core/features/location/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { account, historyBack, navigate, toastSuccess } = vi.hoisted(() => ({
  account: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as string | undefined },
  historyBack: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
}));

const STORED_AVATAR_URL = "https://images.example/profile/old.webp";
const NEW_AVATAR_URL = "https://images.example/profile/new.webp";

const PICKED_LOCATION: LocationInput = {
  lat: -1.2921,
  lng: 36.8219,
  locationName: "Nairobi CBD, Kenya",
  country: "KE",
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: historyBack } }),
  useCanGoBack: () => true,
  useNavigate: () => navigate,
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: account.address }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: toastSuccess },
}));

// The picker's own map/geolocation/ArcGIS behavior is covered by
// -location-picker.test.tsx; here it's stubbed to a plain value/onChange
// control so this file can focus on prefill + submit-mapping behavior.
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value: LocationInput | undefined;
    onChange: (next: LocationInput | undefined) => void;
  }) => (
    <div>
      <span data-testid="location-value">{value?.locationName ?? ""}</span>
      <button type="button" onClick={() => onChange(PICKED_LOCATION)}>
        set location
      </button>
    </div>
  ),
}));

// Uploading is the field's own job and is covered by -image-upload-field.test.tsx;
// here it is stubbed to a control that yields a URL so this file can focus on
// what the profile payload carries.
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({
    value,
    onChange,
    onBusyChange,
  }: {
    value: string | null;
    onChange: (url: string | null) => void;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <div>
      <span data-testid="avatar-value">{value ?? ""}</span>
      <button type="button" onClick={() => onChange(NEW_AVATAR_URL)}>
        set photo
      </button>
      <button type="button" onClick={() => onChange(null)}>
        remove photo
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        start upload
      </button>
    </div>
  ),
}));

import { ProfileEditPage } from "./profile-edit-page";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function profilePayload(overrides: Record<string, unknown> = {}) {
  return {
    address: account.address,
    name: "Alice",
    email: "alice@example.com",
    phone: "+254712345678",
    country: "KE",
    locationName: null,
    geoLat: null,
    geoLng: null,
    createdAt: "2026-07-01T12:20:29Z",
    ...overrides,
  };
}

function mockBackend(
  profile: Record<string, unknown> = {},
  { rejectSave }: { rejectSave?: string } = {},
) {
  // Saves persist, so the refetch after a save reads what was written.
  let stored = profilePayload(profile);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/profile") && init?.method === "POST") {
      if (rejectSave) return Promise.resolve(errorResponse(409, rejectSave));
      stored = { ...stored, ...(JSON.parse(init.body as string) as Record<string, unknown>) };
      return Promise.resolve(jsonResponse(stored));
    }
    if (url.includes("/auth/profile")) {
      return Promise.resolve(jsonResponse(stored));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The body of the one POST /auth/profile the form made. */
function postBody(fetchMock: ReturnType<typeof mockBackend>) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) => requestUrl(input).includes("/auth/profile") && init?.method === "POST",
  );
  return call?.[1]?.body as string;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function errorResponse(status: number, description: string) {
  return {
    ok: false,
    status,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: false, description })),
  };
}

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

afterEach(() => {
  account.address = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
  historyBack.mockReset();
  navigate.mockReset();
  toastSuccess.mockReset();
  vi.restoreAllMocks();
});

describe("ProfileEditPage", () => {
  it("prefills the form from the loaded profile", async () => {
    mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    expect(screen.getByDisplayValue("alice@example.com")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /preferred currency/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /bio/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /website/i })).toBeTruthy();
    const phone = screen.getByLabelText(/phone number/i) as HTMLInputElement;
    expect(phone.value.replace(/\s/g, "")).toContain("712345678");
  });

  it("shows the saved username on its own, outside the contact form", async () => {
    mockBackend({ username: "alice" });

    renderWithQueryClient(<ProfileEditPage />);

    const section = await screen.findByRole("region", { name: /^username$/i });
    expect(within(section).getByText("alice")).toBeTruthy();
    expect(within(section).getByRole("button", { name: /change username/i })).toBeTruthy();
    const form = screen.getByRole("form", { name: /edit profile/i });
    expect(within(form).queryByLabelText(/^username$/i)).toBeNull();
  });

  it("says when the account has no username yet", async () => {
    mockBackend({ username: null });

    renderWithQueryClient(<ProfileEditPage />);

    const section = await screen.findByRole("region", { name: /^username$/i });
    expect(within(section).getByText(/you don't have a username yet/i)).toBeTruthy();
    expect(within(section).getByRole("button", { name: /choose username/i })).toBeTruthy();
  });

  it("saves a new username alone, keeping the contact form's unsaved edits out", async () => {
    const fetchMock = mockBackend({ username: "alice" });

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.change(await screen.findByLabelText(/^name$/i), {
      target: { value: "Alice Cooper" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change username/i }));
    const sheet = await screen.findByRole("form", { name: /change username/i });
    fireEvent.change(within(sheet).getByLabelText(/^username$/i), {
      target: { value: "Željko Petrović" },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: /save username/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Username updated"));
    const body = JSON.parse(postBody(fetchMock)) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: "Alice",
      username: "Željko Petrović",
      email: "alice@example.com",
      phone: "+254712345678",
      country: "KE",
    });
    for (const key of ["preferredCurrency", "bio", "website", "clearLocation", "avatarUrl"]) {
      expect(body).not.toHaveProperty(key);
    }
    const section = screen.getByRole("region", { name: /^username$/i });
    await waitFor(() => expect(within(section).getByText("Željko Petrović")).toBeTruthy());
    expect(historyBack).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Alice Cooper")).toBeTruthy();
  });

  it("keeps the sheet open with the reason when the username is taken", async () => {
    mockBackend({ username: null }, { rejectSave: "username or pool name is already in use" });

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /choose username/i }));
    const sheet = await screen.findByRole("form", { name: /choose username/i });
    fireEvent.change(within(sheet).getByLabelText(/^username$/i), { target: { value: "bob" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /save username/i }));

    expect(
      await within(sheet).findByText("That username or pool name is already taken"),
    ).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not save an unchanged or blank username", async () => {
    mockBackend({ username: "alice" });

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /change username/i }));
    const sheet = await screen.findByRole("form", { name: /change username/i });
    const save = within(sheet).getByRole("button", { name: /save username/i });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(within(sheet).getByLabelText(/^username$/i), { target: { value: " " } });
    expect(save.hasAttribute("disabled")).toBe(true);
  });

  it("leaves the username out of a contact-form save", async () => {
    const fetchMock = mockBackend({ username: "alice" });

    renderWithQueryClient(<ProfileEditPage />);

    await screen.findByDisplayValue("Alice");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(JSON.parse(postBody(fetchMock))).not.toHaveProperty("username");
  });

  it("leaves the location picker empty for an existing user with no captured geo", async () => {
    mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    await screen.findByDisplayValue("Alice");
    expect(screen.getByTestId("location-value").textContent).toBe("");
  });

  it("seeds the location picker from a previously captured location", async () => {
    mockBackend({ locationName: "Mombasa, Kenya", geoLat: -4.0435, geoLng: 39.6682 });

    renderWithQueryClient(<ProfileEditPage />);

    expect(await screen.findByTestId("location-value")).toHaveProperty(
      "textContent",
      "Mombasa, Kenya",
    );
  });

  it("does not seed the location picker from an incomplete geo tuple", async () => {
    mockBackend({ locationName: "", geoLat: -4.0435, geoLng: 39.6682 });

    renderWithQueryClient(<ProfileEditPage />);

    await screen.findByDisplayValue("Alice");
    expect(screen.getByTestId("location-value").textContent).toBe("");
  });

  it("starts the email field blank when the profile has a placeholder email", async () => {
    mockBackend({ email: "pending+abc@clc.local" });

    renderWithQueryClient(<ProfileEditPage />);

    const email = (await screen.findByLabelText(/^email$/i)) as HTMLInputElement;
    expect(email.value).toBe("");
  });

  it("saves edited fields plus the picked location, shows a toast, and navigates back", async () => {
    const fetchMock = mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    const name = (await screen.findByLabelText(/^name$/i)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Alice Cooper" } });
    fireEvent.click(screen.getByRole("button", { name: /set location/i }));

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) => requestUrl(input).includes("/auth/profile") && init?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    expect(JSON.parse(postCall?.[1]?.body as string)).toMatchObject({
      name: "Alice Cooper",
      email: "alice@example.com",
      phone: "+254712345678",
      country: PICKED_LOCATION.country,
      preferredCurrency: "KES",
      bio: "",
      website: "",
      locationName: PICKED_LOCATION.locationName,
      geoLat: PICKED_LOCATION.lat,
      geoLng: PICKED_LOCATION.lng,
    });
    expect(historyBack).toHaveBeenCalledTimes(1);
  });

  it("clears a saved location explicitly", async () => {
    const fetchMock = mockBackend({
      locationName: "Mombasa, Kenya",
      geoLat: -4.0435,
      geoLng: 39.6682,
    });

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /clear location/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) => requestUrl(input).includes("/auth/profile") && init?.method === "POST",
    );
    const body = JSON.parse(postCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: "Alice",
      email: "alice@example.com",
      phone: "+254712345678",
      country: "KE",
      clearLocation: true,
    });
    expect(body).not.toHaveProperty("locationName");
    expect(body).not.toHaveProperty("geoLat");
    expect(body).not.toHaveProperty("geoLng");
  });

  it("prefills and persists the saved profile details", async () => {
    const fetchMock = mockBackend({
      preferredCurrency: "TZS",
      bio: "Tanzanian grower",
      website: "https://grow.example",
    });

    renderWithQueryClient(<ProfileEditPage />);

    expect(await screen.findByDisplayValue("Tanzanian grower")).toBeTruthy();
    expect(screen.getByDisplayValue("https://grow.example")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    expect(JSON.parse(postBody(fetchMock))).toMatchObject({
      preferredCurrency: "TZS",
      bio: "Tanzanian grower",
      website: "https://grow.example",
    });
  });

  it("saves a newly chosen profile photo", async () => {
    const fetchMock = mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /set photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const body = JSON.parse(postBody(fetchMock)) as Record<string, unknown>;
    expect(body.avatarUrl).toBe(NEW_AVATAR_URL);
  });

  it("omits avatarUrl when the photo was not touched, so a stored one is preserved", async () => {
    const fetchMock = mockBackend({ avatarUrl: STORED_AVATAR_URL });

    renderWithQueryClient(<ProfileEditPage />);

    const name = (await screen.findByLabelText(/^name$/i)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Alice Cooper" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    expect(screen.getByTestId("avatar-value").textContent).toBe(STORED_AVATAR_URL);
    expect(JSON.parse(postBody(fetchMock))).not.toHaveProperty("avatarUrl");
  });

  it("clears a stored photo with the backend's clearAvatar flag", async () => {
    const fetchMock = mockBackend({ avatarUrl: STORED_AVATAR_URL });

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /remove photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const body = JSON.parse(postBody(fetchMock)) as Record<string, unknown>;
    expect(body.clearAvatar).toBe(true);
    expect(body).not.toHaveProperty("avatarUrl");
  });

  it("blocks saving while the photo is still uploading", async () => {
    mockBackend();

    renderWithQueryClient(<ProfileEditPage />);

    fireEvent.click(await screen.findByRole("button", { name: /start upload/i }));

    expect(screen.getByRole("button", { name: /uploading photo/i }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
