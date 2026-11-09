import type { Offering } from "@clc/api/features/offerings/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Saving an offering across the phone/desktop view swap. The phone sheet and
 * the desktop dialog both save through `useOfferingForm`; a write still in
 * flight when the sheet unmounts must keep the dialog's Save busy, or a second
 * press writes the offering twice.
 */
const VOUCHER = "0x2222222222222222222222222222222222222222";
const OFFERING = {
  id: "41",
  sourceId: null,
  voucherId: "9",
  voucherAddress: VOUCHER,
  voucherName: "Malii",
  voucherSymbol: "MALII",
  voucherUoa: "KES",
  priceInUnitOfAccount: null,
  voucherDecimals: 6,
  sellerAddress: "0x1111111111111111111111111111111111111111",
  name: "Fresh maize",
  description: "Picked this week",
  quantity: "1",
  unit: "kg",
  unitLabel: "kg",
  frequency: null,
  pricePerUnit: "50",
  available: true,
  locationName: null,
  geoLat: null,
  geoLng: null,
  imageUrl: null,
  tags: [],
} as Offering;

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("#/lib/api/offerings", () => ({
  offeringsClient: {
    createVoucherOffering: vi.fn(),
    updateVoucherOffering: mocks.update,
    deleteVoucherOffering: vi.fn(),
  },
}));
vi.mock("#/hooks/use-vocabulary", () => ({
  useOfferingUnits: () => ({ data: ["kg", "item"] }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
// The desktop list around the dialog is not under test: it holds the edit open.
vi.mock("#/features/vouchers/hooks/use-voucher-offerings-manager", () => ({
  useVoucherOfferingsManager: () => ({
    isOwner: true,
    usage: { data: undefined, isPending: false, isError: false, isFetching: false },
    query: {
      data: { pages: [{ offerings: [] }] },
      isPending: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
    },
    editor: { kind: "edit", offering: OFFERING },
    setEditor: vi.fn(),
    canCreate: true,
    deletingID: null,
    requestDelete: vi.fn(),
    defaultImageUrl: null,
  }),
}));

import { OfferingEditorSheet } from "#/components/vouchers/offering-editor-sheet";
import { VoucherOfferingsDesk } from "#/desktop/vouchers/detail/voucher-offerings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Editing an offering across a phone/desktop view switch", () => {
  it("keeps Save busy in the other view while the first press is still saving", async () => {
    const saved = deferred<Offering>();
    mocks.update.mockReturnValue(saved.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const withClient = (ui: ReactNode) => (
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    );

    const phone = render(
      withClient(
        <OfferingEditorSheet
          editor={{ kind: "edit", offering: OFFERING }}
          voucherAddress={VOUCHER}
          priceCurrency="KES"
          defaultImageUrl={null}
          onClose={vi.fn()}
        />,
      ),
    );
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    phone.unmount();

    render(
      withClient(
        <VoucherOfferingsDesk
          address={VOUCHER}
          symbol="MALII"
          voucherValue="10"
          voucherUoa="KES"
          ownerAddress={OFFERING.sellerAddress}
          layout="page"
        />,
      ),
    );

    const dialog = await screen.findByRole("dialog");
    const saving = within(dialog).getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(saving.disabled).toBe(true);

    await act(async () => saved.resolve(OFFERING));

    const save = await within(dialog).findByRole("button", { name: "Save changes" });
    expect(save.getAttribute("aria-busy")).toBeNull();
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
