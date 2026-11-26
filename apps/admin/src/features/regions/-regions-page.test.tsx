import { BackendApiError } from "@clc/api/client/errors";
import { regionKeys } from "@clc/api/features/regions/queries";
import type { Region } from "@clc/core/features/regions/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RegionsPage } from "./regions-page";

const ADDRESS = "0x2222222222222222222222222222222222222222";
const VIEWER = "0x1111111111111111111111111111111111111111";
const BHUTAN: Region = {
  id: "1",
  name: "Bhutan",
  countryCode: "BTN",
  active: true,
  revision: 1,
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [88, 26],
        [92, 26],
        [92, 29],
        [88, 26],
      ],
    ],
  },
  poolApproval: false,
  assignedAdmins: [],
};

const mock = vi.hoisted(() => ({
  operatorRole: "ADMIN",
  list: vi.fn(),
  countries: vi.fn(),
  country: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setAssignment: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("#/features/auth/admin-session", () => ({
  useAdminSession: () => ({
    status: "authenticated",
    operator: { role: mock.operatorRole, address: VIEWER },
  }),
}));
vi.mock("#/lib/api", () => ({
  clcApi: {
    regions: mock,
    admin: { listUsers: mock.listUsers },
  },
}));
vi.mock("./region-map.lazy", () => ({
  RegionMap: ({ areas, highlighted }: { areas: Region[]; highlighted: string[] }) => (
    <div data-testid="region-map">
      {areas.length} areas · {highlighted.join(",")}
    </div>
  ),
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RegionsPage />
    </QueryClientProvider>,
  );
  return client;
}

async function openRegion() {
  fireEvent.click(await screen.findByRole("button", { name: "Bhutan" }));
}

describe("Global Regions console", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.operatorRole = "ADMIN";
    mock.list.mockResolvedValue([BHUTAN]);
    mock.countries.mockResolvedValue([{ code: "BTN", name: "Bhutan" }]);
    mock.country.mockResolvedValue({ code: "BTN", name: "Bhutan", boundary: BHUTAN.boundary });
  });

  it("lets a Global Admin preview and save Bhutan without assigning regional staff", async () => {
    mock.list.mockResolvedValueOnce([]);
    mock.create.mockResolvedValue(BHUTAN);
    mount();
    expect(await screen.findByText("No regions have been created.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add region" }));
    const select = await screen.findByRole("combobox", { name: "Country or territory" });
    fireEvent.change(select, { target: { value: "BTN" } });
    const reviewed = await screen.findByRole("checkbox", { name: "I have reviewed this boundary" });
    expect(mock.country).toHaveBeenCalledWith("BTN", expect.any(AbortSignal));
    expect(screen.getByLabelText("Region name")).toHaveProperty("value", "Bhutan");
    expect(screen.getByRole("button", { name: "Save region" })).toHaveProperty("disabled", true);

    fireEvent.click(reviewed);
    fireEvent.click(screen.getByRole("button", { name: "Save region" }));
    expect(
      await screen.findByText("No regional admins assigned. Global admins manage this region."),
    ).toBeTruthy();
    expect(screen.getByText("Pool listings · Automatic")).toBeTruthy();
    expect(mock.create).toHaveBeenCalledOnce();
    expect(mock.create.mock.calls[0]?.[0]).toMatchObject({
      name: "Bhutan",
      countryCode: "BTN",
      active: true,
      poolApproval: false,
    });
    expect(mock.setAssignment).not.toHaveBeenCalled();
  });

  it("requires fresh review after a replacement country's failed preview is retried", async () => {
    const next = { code: "NPL", name: "Nepal", boundary: BHUTAN.boundary };
    mock.countries.mockResolvedValue([{ code: "BTN", name: "Bhutan" }, next]);
    mock.country
      .mockResolvedValueOnce({ code: "BTN", name: "Bhutan", boundary: BHUTAN.boundary })
      .mockRejectedValueOnce(new BackendApiError(404, "No boundary was found."))
      .mockResolvedValueOnce(next);
    mock.create.mockResolvedValue({ ...BHUTAN, countryCode: "NPL", name: "Nepal" });
    mount();

    await screen.findByRole("button", { name: "Bhutan" });
    fireEvent.click(screen.getByRole("button", { name: "Add region" }));
    const country = await screen.findByRole("combobox", { name: "Country or territory" });
    fireEvent.change(country, { target: { value: "BTN" } });
    const reviewLabel = "I have reviewed this boundary";
    fireEvent.click(await screen.findByRole("checkbox", { name: reviewLabel }));
    const save = screen.getByRole("button", { name: "Save region" });
    expect(save).toHaveProperty("disabled", false);

    fireEvent.change(country, { target: { value: "NPL" } });
    expect(screen.getByLabelText("Region name")).toHaveProperty("value", "Nepal");
    expect((await screen.findByRole("alert")).textContent).toContain("No boundary was found.");
    expect(screen.queryByRole("checkbox", { name: reviewLabel })).toBeNull();
    expect(save).toHaveProperty("disabled", true);
    expect(mock.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry boundary" }));
    expect(await screen.findByText("Country boundary · NPL")).toBeTruthy();
    const review = screen.getByRole("checkbox", { name: reviewLabel });
    expect(review).toHaveProperty("checked", false);
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(review);
    fireEvent.click(save);
    await waitFor(() =>
      expect(mock.create).toHaveBeenCalledWith(
        expect.objectContaining({ countryCode: "NPL", name: "Nepal" }),
      ),
    );
  });

  it("rejects an obsolete boundary upload and only saves the latest reviewed geometry", async () => {
    mock.create.mockResolvedValue({ ...BHUTAN, countryCode: null, name: "Custom region" });
    mount();
    await screen.findByRole("button", { name: "Bhutan" });
    fireEvent.click(screen.getByRole("button", { name: "Add region" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Boundary source" }), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Region name"), { target: { value: "Custom region" } });
    const input = screen.getByLabelText("Boundary file");
    const old = new File([], "slow.geojson");
    let completeOldRead: (source: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      completeOldRead = resolve;
    });
    vi.spyOn(old, "text").mockReturnValue(pending);
    fireEvent.change(input, { target: { files: [old] } });

    const invalid = new File(["{}"], "invalid.geojson");
    fireEvent.change(input, { target: { files: [invalid] } });
    expect((await screen.findByRole("alert")).textContent).toContain("closed polygon boundaries");
    await act(async () => completeOldRead(JSON.stringify(BHUTAN.boundary)));
    const save = screen.getByRole("button", { name: "Save region" });
    expect(save).toHaveProperty("disabled", true);
    expect(screen.queryByText("Uploaded custom boundary")).toBeNull();

    const boundary = {
      type: "Polygon",
      coordinates: [
        [
          [159, -19],
          [161, -19],
          [161, -17],
          [159, -19],
        ],
      ],
    };
    const valid = new File([JSON.stringify(boundary)], "correct.geojson");
    fireEvent.change(input, { target: { files: [valid] } });
    const review = await screen.findByRole("checkbox", { name: "I have reviewed this boundary" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(review);
    fireEvent.click(save);
    await waitFor(() =>
      expect(mock.create).toHaveBeenCalledWith({
        countryCode: null,
        name: "Custom region",
        active: true,
        poolApproval: false,
        boundary,
      }),
    );
  });

  it("keeps the editor open and reports an overlap rejected by the server", async () => {
    mock.update.mockRejectedValue(new BackendApiError(409, "Active regions cannot overlap."));
    const client = mount();
    await openRegion();
    fireEvent.click(screen.getByRole("button", { name: "Edit region" }));
    fireEvent.change(screen.getByLabelText("Region name"), { target: { value: "Eastern Bhutan" } });
    act(() => {
      client.setQueryData(regionKeys.admin(VIEWER), [{ ...BHUTAN, revision: 2 }]);
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "I have reviewed this boundary" }));
    fireEvent.click(screen.getByRole("button", { name: "Save region" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Active regions cannot overlap.",
    );
    expect(mock.update).toHaveBeenCalledWith("1", expect.objectContaining({ revision: 1 }));
    expect(screen.getByLabelText("Region name")).toHaveProperty("value", "Eastern Bhutan");
  });

  it("requires confirmation before deactivating a region with assigned staff", async () => {
    mock.list.mockResolvedValue([
      { ...BHUTAN, assignedAdmins: [{ address: ADDRESS, username: "steward" }] },
    ]);
    mock.update.mockResolvedValue({ ...BHUTAN, active: false, assignedAdmins: [] });
    mount();
    await openRegion();
    fireEvent.click(screen.getByRole("button", { name: "Edit region" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "I have reviewed this boundary" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Active region" }));
    const save = screen.getByRole("button", { name: "Save region" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /deactivating this region/i }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(mock.update).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          active: false,
          revision: 1,
          countryCode: "BTN",
          poolApproval: false,
        }),
      ),
    );
  });

  it("only permits explicitly confirmed conversion of a Global Admin by a Superadmin", async () => {
    const account = {
      ethereumAddress: ADDRESS,
      username: "steward",
      role: "ADMIN",
      status: "APPROVED",
    };
    mock.listUsers.mockResolvedValue({ users: [account] });
    const updated = { ...BHUTAN, assignedAdmins: [{ address: ADDRESS, username: "steward" }] };
    mock.setAssignment.mockResolvedValue(updated);
    mock.list.mockResolvedValueOnce([BHUTAN]).mockResolvedValue([updated]);
    mock.operatorRole = "SUPERADMIN";
    mount();
    await openRegion();
    fireEvent.change(screen.getByLabelText("Assign by wallet address"), {
      target: { value: ADDRESS },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    const consent = await screen.findByRole("checkbox", {
      name: /replace this account’s global admin access/i,
    });
    expect(screen.getByRole("button", { name: "Assign regional admin" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "Assign regional admin" }));
    expect(
      await screen.findByRole("button", { name: "Remove steward from the region" }),
    ).toBeTruthy();
    expect(mock.setAssignment).toHaveBeenCalledWith("1", ADDRESS, true, true);
  });

  it("cannot convert a Global Admin using an ordinary Global Admin session", async () => {
    mock.listUsers.mockResolvedValue({
      users: [{ ethereumAddress: ADDRESS, role: "ADMIN", username: "steward", status: "APPROVED" }],
    });
    mount();
    await openRegion();
    fireEvent.change(screen.getByLabelText("Assign by wallet address"), {
      target: { value: ADDRESS },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    expect(await screen.findByText("This account cannot be assigned by your role.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assign regional admin" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(mock.setAssignment).not.toHaveBeenCalled();
  });

  it("filters the map to regions assigned to the selected staff member", async () => {
    mock.list.mockResolvedValue([
      { ...BHUTAN, assignedAdmins: [{ address: ADDRESS, username: "steward" }] },
      { ...BHUTAN, id: "2", name: "Another region" },
    ]);
    mount();
    await screen.findByRole("button", { name: "Another region" });
    fireEvent.change(screen.getByRole("combobox", { name: "Show regions assigned to" }), {
      target: { value: ADDRESS },
    });
    expect(screen.queryByRole("button", { name: "Another region" })).toBeNull();
    expect(screen.getByTestId("region-map").textContent).toContain("1 areas · 1");
  });
});
