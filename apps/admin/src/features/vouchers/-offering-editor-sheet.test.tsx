import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { Offering } from "@clc/api/features/offerings/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { OfferingEditorSheet } from "./ui/offering-editor-sheet";

const ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f";
const PHOTO = "https://cdn.test/offering/new_800_a3f91c2e.webp";

const createVoucherOffering = vi.hoisted(() => vi.fn());
const updateVoucherOffering = vi.hoisted(() => vi.fn());
const deleteVoucherOffering = vi.hoisted(() => vi.fn());
const uploadMutateAsync = vi.hoisted(() => vi.fn());
const uploadState = vi.hoisted(() => ({ isPending: false, isError: false }));

vi.mock("#/lib/api", () => ({
  clcApi: {
    offerings: {
      createVoucherOffering: (...args: unknown[]) => createVoucherOffering(...args),
      updateVoucherOffering: (...args: unknown[]) => updateVoucherOffering(...args),
      deleteVoucherOffering: (...args: unknown[]) => deleteVoucherOffering(...args),
    },
    vocabulary: {
      getOfferingUnits: () =>
        Promise.resolve([
          "kg",
          "g",
          "litre",
          "item",
          "hour",
          "day",
          "bag",
          "unit",
          "bundle",
          "piece",
          "dozen",
          "serving",
          "trip",
          "session",
          "metre",
        ]),
    },
  },
}));

vi.mock("#/lib/storage", () => ({ isStorageConfigured: true }));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: (...args: unknown[]) => uploadMutateAsync(...args),
    reset: () => {},
    get isPending() {
      return uploadState.isPending;
    },
    get isError() {
      return uploadState.isError;
    },
  }),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

function voucher(): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 42220,
    address: ADDRESS as MarketVoucherDetail["address"],
    name: "Kilifi Harvest",
    symbol: "KHV",
    decimals: 6,
    ownerAddress: ADDRESS as MarketVoucherDetail["ownerAddress"],
    description: "A basket of fresh food.",
    voucherUoa: "KES",
    voucherValue: "10",
    locationName: "Kilifi, Kenya",
    lat: -3.5107,
    lng: 39.9093,
    email: null,
    website: null,
    phone: null,
    terms: null,
    iconUrl: null,
    bannerUrl: null,
    tags: ["food"],
    kind: "goods",
    markerIcon: null,
    markerColor: null,
    active: true,
  };
}

function offering(overrides: Partial<Offering> = {}): Offering {
  return {
    id: "5",
    sourceId: null,
    voucherId: "2710",
    voucherAddress: ADDRESS as Offering["voucherAddress"],
    voucherName: "Kilifi Harvest",
    voucherSymbol: "KHV",
    voucherDecimals: 6,
    sellerAddress: ADDRESS as Offering["sellerAddress"],
    name: "Maize flour",
    commodityType: "GOOD",
    description: "Stone-ground, 2kg.",
    quantity: "40",
    unit: "kg",
    unitLabel: "kg",
    frequency: null,
    pricePerUnit: "120",
    available: true,
    locationName: null,
    geoLat: null,
    geoLng: null,
    imageUrl: null,
    tags: [],
    ...overrides,
  };
}

function renderSheet(editor: Parameters<typeof OfferingEditorSheet>[0]["editor"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <OfferingEditorSheet editor={editor} voucher={voucher()} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, queryClient };
}

/**
 * Confirms the crop frame that selection opens, which is what starts the upload.
 *
 * Readiness is the framed image appearing rather than the button's disabled
 * attribute: the frame renders its image once the file has decoded, and that is
 * the same condition that enables the button.
 */
async function confirmCrop() {
  await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));
}

function choosePhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array([1])], "product.jpg", { type: "image/jpeg" })] },
  });
}

/** Fills a labelled text control. */
function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/**
 * Picks an option from one of the two Base UI selects.
 *
 * A plain click is not enough. `SelectItem` ignores a mouse click on an item that
 * is not highlighted — the pointer normally highlights it on the way in, and jsdom
 * fires no hover — so the pointer is announced as touch, which is the one pointer
 * type the item commits without a prior highlight.
 */
async function choose(triggerLabel: string, optionLabel: string) {
  fireEvent.click(screen.getByLabelText(triggerLabel));
  const option = await waitFor(() => screen.getByRole("option", { name: optionLabel }));
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

beforeEach(() => {
  createVoucherOffering.mockReset();
  updateVoucherOffering.mockReset();
  deleteVoucherOffering.mockReset();
  uploadMutateAsync.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  uploadState.isPending = false;
  uploadState.isError = false;
  createVoucherOffering.mockResolvedValue(offering());
  updateVoucherOffering.mockResolvedValue(offering());
  deleteVoucherOffering.mockResolvedValue("5");
  uploadMutateAsync.mockResolvedValue({
    url: PHOTO,
    width: 800,
    height: 600,
    byteSize: 6516,
    contentType: "image/webp",
  });
});

describe("creating", () => {
  it("opens empty, with nothing pre-selected", async () => {
    renderSheet({ kind: "create" });

    expect(await waitFor(() => screen.getByRole("heading", { name: "Add offering" }))).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Price per unit") as HTMLInputElement).value).toBe("");
    // Neither select is defaulted: publishing a classification nobody chose is
    // the failure this avoids.
    expect(screen.getByText("Choose one")).toBeTruthy();
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe("");
    // Nothing to unlist yet.
    expect(screen.queryByRole("button", { name: "Unlist" })).toBeNull();
  });

  it("sends all six fields in the app's vocabulary", async () => {
    const { onClose } = renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Fresh maize flour");
    type("Description", "Stone-ground flour packed on collection day.");
    type("Price per unit", "120.50");
    await choose("Good or service", "Service");
    await choose("Unit", "Litre");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(createVoucherOffering).toHaveBeenCalledTimes(1));
    // The app model's names, not the backend's. Whitespace trimming happens
    // inside the client — past this mock — and is covered there.
    expect(createVoucherOffering.mock.calls[0]?.[1]).toEqual({
      name: "Fresh maize flour",
      commodityType: "SERVICE",
      description: "Stone-ground flour packed on collection day.",
      unit: "litre",
      pricePerUnit: "120.50",
      imageUrl: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("Offering published.");
  });

  // The picker is a suggestion, not a closed set. A seller whose measure nobody
  // seeded types it, and the value the backend adopts is the Title Case one.
  it("creates a custom unit from free text", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Seedling tray");
    type("Description", "Twenty cells, ready to plant.");
    type("Price per unit", "350");
    await choose("Good or service", "Good");

    const unit = screen.getByLabelText("Unit") as HTMLInputElement;
    fireEvent.focus(unit);
    fireEvent.change(unit, { target: { value: "produce   crate" } });
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Produce Crate/ })));
    expect(unit.value).toBe("Produce Crate");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(createVoucherOffering).toHaveBeenCalled());
    expect(createVoucherOffering.mock.calls[0]?.[1].unit).toBe("Produce Crate");
  });

  // A decimal wider than float64. It must reach the client as typed, because from
  // there it goes to NUMERIC as text.
  it("does not round a long decimal", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Bulk grain");
    type("Description", "By the tonne.");
    type("Price per unit", "12345678901234567890.12345");
    await choose("Good or service", "Good");
    await choose("Unit", "Kilogram");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(createVoucherOffering).toHaveBeenCalled());
    expect(createVoucherOffering.mock.calls[0]?.[1].pricePerUnit).toBe(
      "12345678901234567890.12345",
    );
  });

  // The price field is inputMode=decimal rather than type=number: a number input
  // lets the browser localise and round, and this value must arrive exact.
  it("uses a decimal keypad rather than a number input", async () => {
    renderSheet({ kind: "create" });

    const price = (await waitFor(() =>
      screen.getByLabelText("Price per unit"),
    )) as HTMLInputElement;
    expect(price.inputMode).toBe("decimal");
    expect(price.type).not.toBe("number");
  });
});

describe("validation", () => {
  it.each([
    ["a blank name", { name: "   ", price: "10" }],
    ["a zero price", { name: "Flour", price: "0" }],
    ["an exponent price", { name: "Flour", price: "1e3" }],
    ["a separator price", { name: "Flour", price: "1,000" }],
  ])("refuses to submit with %s", async (_label, values) => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", values.name);
    type("Description", "Something.");
    type("Price per unit", values.price);
    await choose("Good or service", "Good");
    await choose("Unit", "Kilogram");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(createVoucherOffering).not.toHaveBeenCalled();
  });

  it("refuses to submit with no classification or unit chosen", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Flour");
    type("Description", "Something.");
    type("Price per unit", "10");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(createVoucherOffering).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("opens on the selected offering", async () => {
    renderSheet({ kind: "edit", offering: offering() });

    expect(
      await waitFor(() => screen.getByRole("heading", { name: "Edit offering" })),
    ).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Maize flour");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Stone-ground, 2kg.",
    );
    expect((screen.getByLabelText("Price per unit") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe("Kilogram");
    expect(screen.getByText("Good")).toBeTruthy();
  });

  it("puts the edited row and closes", async () => {
    const { onClose } = renderSheet({ kind: "edit", offering: offering() });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Renamed flour");
    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(updateVoucherOffering).toHaveBeenCalledTimes(1));
    expect(updateVoucherOffering.mock.calls[0]?.[1]).toBe("5");
    expect(updateVoucherOffering.mock.calls[0]?.[2]).toMatchObject({ name: "Renamed flour" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("allows an imported free-text unit to become a custom unit", async () => {
    renderSheet({
      kind: "edit",
      offering: offering({ unit: null, unitLabel: "50kg sack" }),
    });

    await waitFor(() => screen.getByLabelText("Name"));
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe("50kg sack");

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));
    await waitFor(() => expect(updateVoucherOffering).toHaveBeenCalled());
    expect(updateVoucherOffering.mock.calls[0]?.[2].unit).toBe("50kg sack");
  });

  it("forces a classification on a row imported without one", async () => {
    renderSheet({ kind: "edit", offering: offering({ commodityType: null }) });

    await waitFor(() => screen.getByLabelText("Name"));
    expect(screen.getByText(/no goods or services classification/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(updateVoucherOffering).not.toHaveBeenCalled();
  });

  // A failed write keeps every value, including the uploaded photo URL, so Retry
  // does not upload the same file again.
  it("keeps the form open and the values intact when the write fails", async () => {
    updateVoucherOffering.mockRejectedValue(new Error("voucher is retired"));
    const { onClose } = renderSheet({
      kind: "edit",
      offering: offering({ imageUrl: PHOTO }),
    });

    await waitFor(() => screen.getByLabelText("Name"));
    type("Name", "Renamed flour");
    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("voucher is retired"));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Renamed flour");
  });
});

describe("the photo", () => {
  // The same two steps as a pool logo or a voucher icon: choose, then frame. The
  // service resizes but never crops, so the square the operator drags into view
  // is the square every screen will show.
  it("frames the photo before uploading it to the offering purpose", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    choosePhoto();

    // Nothing is uploaded until the frame is confirmed.
    expect(await waitFor(() => screen.getByText("Frame the image"))).toBeTruthy();
    expect(uploadMutateAsync).not.toHaveBeenCalled();

    await confirmCrop();

    await waitFor(() => expect(uploadMutateAsync).toHaveBeenCalledTimes(1));
    expect(uploadMutateAsync.mock.calls[0]?.[0]).toMatchObject({ purpose: "offering.photo" });
  });

  // Selection uploads and save persists a URL, so the two are separate actions
  // and Save has to wait. Otherwise it sends the value the form held before.
  // Selection and save are separate actions, so Save has to wait for the URL.
  // Queried with `hidden` because the crop dialog is modal: while it is open the
  // sheet behind it is out of the accessibility tree, which is correct — the
  // button being unreachable is another way of being blocked.
  it("blocks Save from selection until the upload finishes", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    expect(
      (screen.getByRole("button", { name: "Save offering" }) as HTMLButtonElement).disabled,
    ).toBe(false);

    // Flipped after the field has mounted, because the shared upload hook's
    // pending flag is what the field reads and a mount-time true would relabel
    // the button before anything was chosen.
    uploadState.isPending = true;
    choosePhoto();

    // An unconfirmed frame has produced no URL either, so it blocks Save for the
    // same reason an in-flight upload does.
    await waitFor(() => expect(screen.getByText("Frame the image")).toBeTruthy());
    const blocked = () =>
      screen.getByRole("button", { name: "Uploading photo…", hidden: true }) as HTMLButtonElement;
    await waitFor(() => expect(blocked()).toBeTruthy());
    expect(blocked().disabled).toBe(true);

    await confirmCrop();

    // Still blocked, now by the upload itself rather than the frame.
    await waitFor(() => expect(uploadMutateAsync).toHaveBeenCalled());
    expect(blocked().disabled).toBe(true);
  });

  it("sends the uploaded URL with the write", async () => {
    renderSheet({ kind: "create" });

    await waitFor(() => screen.getByLabelText("Name"));
    choosePhoto();
    await confirmCrop();
    await waitFor(() => expect(uploadMutateAsync).toHaveBeenCalled());

    type("Name", "Flour");
    type("Description", "Something.");
    type("Price per unit", "10");
    await choose("Good or service", "Good");
    await choose("Unit", "Kilogram");
    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(createVoucherOffering).toHaveBeenCalled());
    expect(createVoucherOffering.mock.calls[0]?.[1].imageUrl).toBe(PHOTO);
  });

  // Clearing sends an explicit null. PUT is assign-all, so an omitted key would be
  // indistinguishable from a client that forgot the field.
  it("clears the photo to null", async () => {
    renderSheet({ kind: "edit", offering: offering({ imageUrl: PHOTO }) });

    await waitFor(() => screen.getByLabelText("Name"));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save offering" }));

    await waitFor(() => expect(updateVoucherOffering).toHaveBeenCalled());
    expect(updateVoucherOffering.mock.calls[0]?.[2].imageUrl).toBeNull();
  });
});

describe("unlisting", () => {
  it("asks first, then calls the nested endpoint", async () => {
    const { onClose } = renderSheet({ kind: "edit", offering: offering() });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Unlist" })));

    const confirm = await waitFor(() => screen.getByRole("button", { name: "Unlist offering" }));
    expect(screen.getByText(/Remove Maize flour from the marketplace/)).toBeTruthy();
    expect(deleteVoucherOffering).not.toHaveBeenCalled();

    fireEvent.click(confirm);

    await waitFor(() => expect(deleteVoucherOffering).toHaveBeenCalledWith(ADDRESS, "5"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("Offering unlisted.");
  });

  it("does nothing when the operator backs out", async () => {
    renderSheet({ kind: "edit", offering: offering() });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Unlist" })));
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Keep it" })));

    expect(deleteVoucherOffering).not.toHaveBeenCalled();
  });

  it("reports a refused delete without closing", async () => {
    deleteVoucherOffering.mockRejectedValue(new Error("only the voucher owner"));
    const { onClose } = renderSheet({ kind: "edit", offering: offering() });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Unlist" })));
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Unlist offering" })));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("only the voucher owner"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
