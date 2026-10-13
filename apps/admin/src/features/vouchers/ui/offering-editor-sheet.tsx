import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { Offering, OfferingWrite } from "@clc/api/features/offerings/client";
import {
  OFFERING_UNITS,
  type OfferingCommodityType,
  type OfferingUnit,
  isOfferingUnit,
  offeringWriteSchema,
} from "@clc/core/features/offerings/logic";
import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { offeringUnitsQueryOptions } from "@clc/api/features/vocabulary/queries";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ImageUploadField } from "#/components/admin/image-upload-field";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { SearchableSelect } from "#/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import { isStorageConfigured } from "#/lib/storage";
import { clcApi } from "#/lib/api";

import {
  useCreateVoucherOffering,
  useDeleteVoucherOffering,
  useUpdateVoucherOffering,
} from "../use-offering-mutations";

/** Adding a new offering, or editing one that exists. */
export type OfferingEditor = { kind: "create" } | { kind: "edit"; offering: Offering };

/**
 * English option labels, owned here.
 *
 * `OFFERING_UNITS` lives in `@clc/core` because the *set* is a domain fact both
 * apps and the database share. The words are not: this console is English-only
 * while `apps/web` builds a translated list, so a label table in the shared
 * package would put locale policy in a platform-agnostic module.
 *
 * Keyed by unit rather than listed separately, so a unit added to the domain set
 * without a label here is a type error rather than a blank option.
 */
const UNIT_LABELS: Record<OfferingUnit, string> = {
  kg: "Kilogram",
  g: "Gram",
  litre: "Litre",
  item: "Item",
  hour: "Hour",
  day: "Day",
  bag: "Bag",
  unit: "Unit",
  bundle: "Bundle",
  piece: "Piece",
  dozen: "Dozen",
  serving: "Serving",
  trip: "Trip",
  session: "Session",
  metre: "Metre",
};

const COMMODITY_TYPE_LABELS: Record<OfferingCommodityType, string> = {
  GOOD: "Good",
  SERVICE: "Service",
};

/**
 * The create and edit surface for one voucher's offerings.
 *
 * Its own sheet rather than a branch of `EditVoucherSheet`: that sheet edits the
 * catalog's row for the voucher through a different endpoint, and folding two
 * resources into one form was what let the offering half sit there as a no-op for
 * as long as it did.
 *
 * Create and edit share every field. The only differences are the title, whether
 * a delete action is offered, and where the initial values come from — which is
 * the point: an operator editing an offering should be looking at the same six
 * questions they answered to publish it.
 */
export function OfferingEditorSheet({
  editor,
  voucher,
  onClose,
}: {
  editor: OfferingEditor | null;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  const offering = editor?.kind === "edit" ? editor.offering : null;

  return (
    <Sheet
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="bg-card w-full shadow-none data-[side=right]:sm:max-w-[32rem]"
        showCloseButton
      >
        <SheetHeader className="border-b">
          <SheetTitle>{offering ? "Edit offering" : "Add offering"}</SheetTitle>
          <SheetDescription>
            {offering ? offering.name : `New offering for ${voucher.name}`}
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          // Keyed on the record so reopening on another offering rebuilds the
          // form: TanStack Form reads defaultValues once, and a reused instance
          // would show the previous row's values.
          <OfferingForm
            key={offering?.id ?? "create"}
            offering={offering}
            voucher={voucher}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Turns a stored row into form values.
 *
 * `unit` and `commodityType` fall back to the empty string when the imported row
 * carries something outside the canonical sets. That is deliberate and is what
 * forces the operator to choose: the value is still shown on the card, but it
 * cannot be saved back, and a select silently pre-filled with an invalid option
 * would make the save fail with nothing on screen to explain why.
 */
function initialValues(offering: Offering | null) {
  return {
    name: offering?.name ?? "",
    commodityType: (offering?.commodityType ?? "") as OfferingCommodityType | "",
    description: offering?.description ?? "",
    unit: offering?.unit ?? offering?.unitLabel ?? "",
    pricePerUnit: offering?.pricePerUnit ?? "",
    imageUrl: offering?.imageUrl ?? null,
  };
}

function OfferingForm({
  offering,
  voucher,
  onClose,
}: {
  offering: Offering | null;
  voucher: MarketVoucherDetail;
  onClose: () => void;
}) {
  const create = useCreateVoucherOffering(voucher.address);
  const update = useUpdateVoucherOffering(voucher.address);
  const remove = useDeleteVoucherOffering(voucher.address);
  const unitsQuery = useQuery(offeringUnitsQueryOptions(clcApi.vocabulary));
  const unitValues = [...(unitsQuery.data ?? OFFERING_UNITS)];
  if (offering?.unit && !unitValues.includes(offering.unit)) unitValues.push(offering.unit);
  const unitOptions = unitValues.map((unit) => ({
    value: unit,
    label: isOfferingUnit(unit) ? UNIT_LABELS[unit] : unit,
  }));

  /**
   * Whether the photo field is mid-upload.
   *
   * The field uploads on selection and reports a URL through `onChange`, so a Save
   * pressed while that is in flight would send the previous value. Without this
   * flag the parent cannot see the race at all.
   */
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const saving = create.isPending || update.isPending;
  const deleting = remove.isPending;

  const form = useForm({
    defaultValues: initialValues(offering),
    validators: { onSubmit: offeringWriteSchema },
    onSubmit: async ({ value }) => {
      // The schema has already narrowed the two selects away from "", so the cast
      // is the type system catching up with a validated value rather than an
      // assumption about it.
      const input = value as OfferingWrite;
      try {
        if (offering) {
          await update.mutateAsync({ id: offering.id, input });
          toast.success("Offering updated.");
        } else {
          await create.mutateAsync(input);
          toast.success("Offering published.");
        }
        onClose();
      } catch (error) {
        // The sheet stays open and every value stays put — including an uploaded
        // photo URL, so a retry does not re-upload the same file.
        toast.error(error instanceof Error ? error.message : "Could not save the offering.");
      }
    },
  });

  function requestClose() {
    if (saving || deleting) return;
    if (form.state.isDirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  async function confirmDelete() {
    if (!offering) return;
    try {
      await remove.mutateAsync(offering.id);
      toast.success("Offering unlisted.");
      setConfirmingDelete(false);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unlist the offering.");
    }
  }

  const legacyType = offering && !offering.commodityType;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {legacyType ? (
          <p className="border-border bg-muted/40 text-muted-foreground border p-3 text-xs leading-snug">
            This offering was imported with no goods or services classification. Choose one below
            before saving.
          </p>
        ) : null}

        <form.Field name="name">
          {(field) => (
            <Field htmlFor={field.name} label="Name" error={getFieldError(field.state.meta.errors)}>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                maxLength={120}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="commodityType">
          {(field) => (
            <Field
              htmlFor={field.name}
              label="Good or service"
              error={getFieldError(field.state.meta.errors)}
            >
              <Select
                items={COMMODITY_TYPE_LABELS}
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next as OfferingCommodityType)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMMODITY_TYPE_LABELS) as OfferingCommodityType[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {COMMODITY_TYPE_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Field
              htmlFor={field.name}
              label="Description"
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id={field.name}
                rows={4}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                maxLength={2000}
              />
            </Field>
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="pricePerUnit">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Price per unit"
                hint={`Priced in ${voucher.symbol}.`}
                error={getFieldError(field.state.meta.errors)}
              >
                {/* inputMode, not type="number": a number input lets the browser
                    localise and round the value, and this one has to reach
                    NUMERIC as the exact text that was typed. */}
                <Input
                  id={field.name}
                  inputMode="decimal"
                  autoComplete="off"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="font-data"
                  maxLength={64}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="unit">
            {(field) => (
              <Field
                htmlFor={field.name}
                label="Unit"
                error={getFieldError(field.state.meta.errors)}
              >
                <SearchableSelect
                  id={field.name}
                  options={unitOptions}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  placeholder="Choose a unit"
                  emptyMessage="No units found."
                  createLabel={(unit) => `Use “${unit}”`}
                  normalizeCustomValue={toVocabularyTitleCase}
                  validateCustomValue={validateCustomUnit}
                />
              </Field>
            )}
          </form.Field>
        </div>

        {isStorageConfigured ? (
          <form.Field name="imageUrl">
            {(field) => (
              <ImageUploadField
                label="Photo"
                purpose="offering.photo"
                value={field.state.value}
                onChange={(url) => field.handleChange(url)}
                onBusyChange={setPhotoBusy}
                disabled={saving || deleting}
              />
            )}
          </form.Field>
        ) : null}
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t">
        {offering ? (
          <Button
            type="button"
            variant="destructive"
            disabled={saving || deleting}
            onClick={() => setConfirmingDelete(true)}
          >
            {deleting ? "Unlisting…" : "Unlist"}
          </Button>
        ) : (
          <span />
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          {/* Disabled while the photo uploads, or Save would persist the URL the
              form held before the new file finished. */}
          <Button type="submit" disabled={saving || deleting || photoBusy}>
            {saving ? "Saving…" : photoBusy ? "Uploading photo…" : "Save offering"}
          </Button>
        </div>
      </SheetFooter>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlist this offering?</DialogTitle>
            <DialogDescription>Remove {offering?.name} from the marketplace?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Unlisting…" : "Unlist offering"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/**
 * `htmlFor` is passed rather than inferred: a select's id belongs to the trigger
 * inside it, and a Label with no target leaves the control with no accessible
 * name at all.
 */
function Field({
  htmlFor,
  label,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
