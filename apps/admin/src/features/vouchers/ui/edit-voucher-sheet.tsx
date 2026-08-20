import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { Offering } from "@clc/api/features/offerings/client";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";

/** What the sheet is editing: the voucher's own record, or one of its offerings. */
export type VoucherEditor = { kind: "voucher" } | { kind: "offering"; offering: Offering };

/**
 * The edit surface for a voucher and its offerings.
 *
 * **This form does not save yet.** clc-core exposes no admin write for either
 * resource, so submitting is a no-op and the sheet exists as the shape the write
 * will take. It is kept rather than removed because it is the only description
 * anywhere of which fields an operator is expected to own — unlike the pool
 * screen's sheets, which relay a signed batch and are wired end to end.
 *
 * Fields are uncontrolled and keyed off the record, so reopening the sheet shows
 * what the catalog holds rather than the last thing typed into it. When the write
 * lands this becomes a TanStack Form with a zod schema, the same as
 * `edit-pool-profile-sheet`.
 */
export function EditVoucherSheet({
  editor,
  voucher,
  onClose,
}: {
  editor: VoucherEditor | null;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  const offering = editor?.kind === "offering" ? editor.offering : null;

  return (
    <Sheet
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg" showCloseButton>
        <SheetHeader className="border-b">
          <SheetTitle>{offering ? "Edit offering" : "Edit voucher"}</SheetTitle>
          <SheetDescription>{offering ? offering.commodityName : voucher.name}</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid flex-1 gap-4 overflow-y-auto p-4">
            {offering ? (
              <OfferingFields offering={offering} />
            ) : (
              <VoucherFields voucher={voucher} />
            )}
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function VoucherFields({ voucher }: { voucher: MarketVoucherDetail }) {
  return (
    <>
      <Field id="voucher-name" label="Name" defaultValue={voucher.name} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="voucher-symbol" label="Symbol" defaultValue={voucher.symbol} />
        <Field id="voucher-kind" label="Kind" defaultValue={voucher.kind} />
      </div>
      <FieldArea id="voucher-description" label="Description" defaultValue={voucher.description} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="voucher-uoa" label="Unit of account" defaultValue={voucher.voucherUoa} />
        <Field id="voucher-value" label="Value" defaultValue={voucher.voucherValue} />
      </div>
      <Field id="voucher-location" label="Location" defaultValue={voucher.locationName} />
      <Field id="voucher-phone" label="Phone" defaultValue={voucher.phone} />
      <Field id="voucher-email" label="Email" defaultValue={voucher.email} />
      <Field id="voucher-website" label="Website" defaultValue={voucher.website} />
    </>
  );
}

function OfferingFields({ offering }: { offering: Offering }) {
  return (
    <>
      <Field id="offering-name" label="Commodity" defaultValue={offering.commodityName} />
      <Field id="offering-type" label="Type" defaultValue={offering.commodityType} />
      <FieldArea
        id="offering-description"
        label="Description"
        defaultValue={offering.description}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field id="offering-quantity" label="Quantity" defaultValue={offering.quantity} />
        <Field id="offering-unit" label="Unit" defaultValue={offering.unit} />
      </div>
      <Field id="offering-price" label="Price" defaultValue={offering.price} />
    </>
  );
}

function Field({
  id,
  label,
  defaultValue,
}: {
  id: string;
  label: string;
  defaultValue: string | null;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

function FieldArea({
  id,
  label,
  defaultValue,
}: {
  id: string;
  label: string;
  defaultValue: string | null;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {/* No `rounded-none`: the admin theme zeroes the radius tokens, so every
          control here is square already. */}
      <Textarea id={id} name={id} defaultValue={defaultValue ?? ""} />
    </div>
  );
}
