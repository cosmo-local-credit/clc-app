import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Want } from "@clc/core/features/wants/logic";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { WantFormPage } from "./want-form-page";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reopen: vi.fn(),
  mine: vi.fn(),
  profile: {
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
  },
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
  imageUrl: null,
  markerIcon: "question",
  markerColor: "orange",
  contactPermission: 1,
  contactText: null,
};

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: "0xabc", isAuthenticated: true }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => mocks.profile }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: { wants: { used: 0, limit: 3, unlimited: false, canCreate: true } },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  tokenTagsQueryKey: ["deployments", "token-tags"],
  useTokenTags: () => ({ data: ["Repair"], isError: false }),
}));
vi.mock("#/lib/api/wants", () => ({
  wantsClient: {
    create: mocks.create,
    update: mocks.update,
    reopen: mocks.reopen,
    mine: mocks.mine,
    close: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("#/components/resource-usage", () => ({
  ResourceUsage: () => null,
}));
vi.mock("#/components/wallet", () => ({ BackChevron: () => null }));
vi.mock("#/components/ui/image-upload-field", () => ({
  ImageUploadField: ({
    label,
    hint,
    value,
    onChange,
  }: {
    label: string;
    hint?: string;
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <div>
      <span>{label}</span>
      <span>{hint}</span>
      <output data-testid="want-image">{value ?? "marker"}</output>
      <button type="button" onClick={() => onChange(null)}>
        Clear picture
      </button>
    </div>
  ),
}));
vi.mock("#/components/ui/tag-combobox", () => ({
  TagCombobox: () => <div>Tag picker</div>,
}));
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
    markerStyle,
  }: {
    value?: { locationName: string };
    onChange: (value: { lat: number; lng: number; locationName: string; country: string }) => void;
    markerStyle?: { icon: string; color: string };
  }) => (
    <div>
      <output data-testid="location">{value?.locationName ?? "none"}</output>
      <output data-testid="map-marker">{JSON.stringify(markerStyle)}</output>
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

function renderForm(id?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WantFormPage id={id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockResolvedValue(WANT);
  mocks.update.mockReset().mockResolvedValue(WANT);
  mocks.reopen.mockReset().mockResolvedValue(WANT);
  mocks.mine.mockReset().mockResolvedValue({ wants: [WANT], first: 7, last: 7 });
});

describe("Want form", () => {
  it("prefills the complete saved profile location and requires a public contact method", async () => {
    renderForm();

    expect(screen.getByTestId("location").textContent).toBe("Nairobi Market");
    expect(
      screen.getByText(
        "The exact pin will be public. Choose a safe public meeting place, not a private home.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Repair help" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "I need help fixing a wheel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Want" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Check the Want details.");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves the selected location, profile contact permission, and default marker", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Repair help" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "I need help fixing a wheel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose Mombasa" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Share my email" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Want" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      name: "Repair help",
      description: "I need help fixing a wheel",
      location: { lat: -4.0435, lng: 39.6682, locationName: "Mombasa", country: "KE" },
      expiresAt: null,
      shareEmail: true,
      sharePhone: false,
      markerIcon: "question",
      markerColor: "orange",
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/wants/$wantId",
      params: { wantId: "7" },
      search: { from: "wallet" },
      replace: true,
    });
  });

  it("places the shared marker picker after the map and updates its live pin style", () => {
    renderForm();

    const map = screen.getByTestId("map-marker");
    const markerHeading = screen.getByText("Map pin");
    expect(
      map.compareDocumentPosition(markerHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(map.textContent).toBe('{"icon":"question","color":"orange"}');

    fireEvent.click(screen.getByRole("radio", { name: "Message" }));
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(map.textContent).toBe('{"icon":"message","color":"blue"}');
  });

  it("uses the marker by default and snapshots the current profile image only when selected", async () => {
    renderForm();

    expect(screen.getByText("Leave empty to show the Want marker.")).toBeTruthy();
    expect(screen.getByTestId("want-image").textContent).toBe("marker");
    expect(
      screen.getByText(
        "This copies your current profile image. Later profile changes won't update this Want.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use profile image" }));
    expect(screen.getByTestId("want-image").textContent).toBe(
      "https://storage.example/avatar.webp",
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Repair help" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "I need help fixing a wheel" },
    });
    fireEvent.change(screen.getByLabelText("Contact instructions"), {
      target: { value: "Meet at the market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Want" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]?.[0].imageUrl).toBe("https://storage.example/avatar.webp");

    fireEvent.click(screen.getByRole("button", { name: "Clear picture" }));
    expect(screen.getByTestId("want-image").textContent).toBe("marker");
  });

  it("retains the Want location while editing instead of replacing it with the profile location", async () => {
    renderForm("7");

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("Kisumu Market"));
    expect(
      screen.getByRole("checkbox", { name: "Share my email" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("handles an empty start date as validation instead of throwing", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Repair help" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A description" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Contact instructions"), {
      target: { value: "Meet at the market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Want" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Check the Want details.");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
