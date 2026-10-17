import { BackendApiError } from "@clc/api/client/errors";
import type { Offering, OfferingWrite } from "@clc/api/features/offerings/client";
import {
  OFFERING_UNITS,
  type OfferingCommodityType,
  offeringWriteSchema,
} from "@clc/core/features/offerings/logic";
import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { SearchableSelect } from "#/components/ui/searchable-select";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import { isStorageConfigured } from "#/lib/api/storage";
import { useOfferingUnits } from "#/hooks/use-vocabulary";
import {
  useCreateVoucherOffering,
  useUpdateVoucherOffering,
} from "#/features/wallet/hooks/use-offering-mutations";

/** Adding a new offering, or editing one that exists. */
export type OfferingEditor = { kind: "create" } | { kind: "edit"; offering: Offering };

/**
 * The unit an issuer picked, in their language.
 *
 * An exhaustive switch rather than a lookup object, and rather than the shared
 * package holding the words: `t` has to see each literal to extract it, and the
 * domain package is platform-agnostic so it carries no locale policy. The switch
 * being exhaustive means a unit added to `OFFERING_UNITS` is a type error here
 * rather than an untranslated string in production.
 */
function useUnitLabel(): (unit: string) => string {
  const { t } = useLingui();

  return (unit) => {
    switch (unit) {
      case "kg":
        return t`Kilogram`;
      case "g":
        return t`Gram`;
      case "litre":
        return t`Litre`;
      case "item":
        return t`Item`;
      case "hour":
        return t`Hour`;
      case "day":
        return t`Day`;
      case "bag":
        return t`Bag`;
      case "unit":
        return t`Unit`;
      case "bundle":
        return t`Bundle`;
      case "piece":
        return t`Piece`;
      case "dozen":
        return t`Dozen`;
      case "serving":
        return t`Serving`;
      case "trip":
        return t`Trip`;
      case "session":
        return t`Session`;
      case "metre":
        return t`Metre`;
      default:
        return unit;
    }
  };
}

/**
 * A voucher owner's create and edit surface for their own offerings.
 *
 * A bottom sheet, not a page: the offerings tab behind it is where the result
 * lands, and a full screen would lose that context for a six-field form. Nothing
 * here is a card floating in the middle of the screen — the sheet is the surface.
 */
export function OfferingEditorSheet({
  editor,
  voucherAddress,
  priceCurrency,
  defaultImageUrl,
  onClose,
}: {
  editor: OfferingEditor | null;
  voucherAddress: string;
  /** The voucher's unit of account, such as KES — never its token symbol. */
  priceCurrency: string;
  /** The issuer's profile photo, used only for a new offering. */
  defaultImageUrl: string | null;
  onClose: () => void;
}) {
  const offering = editor?.kind === "edit" ? editor.offering : null;

  return (
    <SheetRoot
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {offering ? <Trans>Edit offering</Trans> : <Trans>Add offering</Trans>}
            </SheetTitle>
          </SheetHeader>
          {editor ? (
            // Keyed on the record: TanStack Form reads defaultValues once, so a
            // reused instance would show the previous offering's values.
            <OfferingForm
              key={offering?.id ?? "create"}
              offering={offering}
              voucherAddress={voucherAddress}
              priceCurrency={priceCurrency}
              defaultImageUrl={defaultImageUrl}
              onClose={onClose}
            />
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function OfferingForm({
  offering,
  voucherAddress,
  priceCurrency,
  defaultImageUrl,
  onClose,
}: {
  offering: Offering | null;
  voucherAddress: string;
  priceCurrency: string;
  defaultImageUrl: string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const unitLabel = useUnitLabel();
  const unitsQuery = useOfferingUnits();
  const unitValues = [...(unitsQuery.data ?? OFFERING_UNITS)];
  if (offering?.unit && !unitValues.includes(offering.unit)) unitValues.push(offering.unit);
  const unitOptions = unitValues.map((unit) => ({ value: unit, label: unitLabel(unit) }));
  const create = useCreateVoucherOffering(voucherAddress);
  const update = useUpdateVoucherOffering(voucherAddress);
  const hasSeededDefaultImage = useRef(false);

  /**
   * Whether the photo field is mid-upload.
   *
   * The field uploads on selection and reports a URL, so a submit pressed while
   * that is in flight would send the value the form held before it.
   */
  const [photoBusy, setPhotoBusy] = useState(false);

  const saving = create.isPending || update.isPending;

  const form = useForm({
    defaultValues: {
      name: offering?.name ?? "",
      commodityType: (offering?.commodityType ?? "") as OfferingCommodityType | "",
      description: offering?.description ?? "",
      unit: offering?.unit ?? "",
      pricePerUnit: offering?.pricePerUnit ?? "",
      // A new offering starts with the issuer's profile photo, just like a
      // voucher deployment. Editing preserves the offering's own saved photo
      // (including an intentionally removed one).
      imageUrl: offering ? offering.imageUrl : defaultImageUrl,
    },
    validators: { onSubmit: offeringWriteSchema },
    onSubmit: async ({ value }) => {
      // By this point the photo is already a stored URL: the field uploads on
      // selection, so there is no upload to sequence here and a failed write
      // leaves that URL in the form rather than re-sending the bytes.
      const input = value as OfferingWrite;
      try {
        if (offering) {
          await update.mutateAsync({ id: offering.id, input });
          toast.success(t`Offering updated.`);
        } else {
          await create.mutateAsync(input);
          toast.success(t`Offering published.`);
        }
        onClose();
      } catch (error) {
        toast.error(
          error instanceof BackendApiError && error.code === "E11"
            ? t`Limit reached. Ask an administrator to increase your allowance.`
            : error instanceof Error
              ? error.message
              : t`Couldn't save the offering.`,
        );
      }
    },
  });

  // Profiles can arrive after this sheet mounts. Like the deployment forms,
  // seed only a pristine new record so a photo the issuer chose or removed is
  // never replaced by a late profile response.
  useEffect(() => {
    if (offering || hasSeededDefaultImage.current || !defaultImageUrl) return;
    hasSeededDefaultImage.current = true;
    if (form.getFieldMeta("imageUrl")?.isTouched || form.getFieldValue("imageUrl") !== null) return;
    form.setFieldValue("imageUrl", defaultImageUrl, { dontUpdateMeta: true });
  }, [defaultImageUrl, form, offering]);

  const legacyUnit = offering?.unitLabel && !offering.unit ? offering.unitLabel : null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        {legacyUnit ? (
          <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
            <Trans>
              This listing was imported with the unit “{legacyUnit}”. Pick one below to save your
              changes.
            </Trans>
          </p>
        ) : null}

        <form.Field name="name">
          {(field) => (
            <Field
              htmlFor={field.name}
              label={t`What are you offering?`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id={field.name}
                className="bg-card"
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
              label={t`Is this a good or a service?`}
              error={getFieldError(field.state.meta.errors)}
            >
              {/* Two options, so two buttons rather than a picker: on a phone a
                  binary choice made in one tap beats one made in three. */}
              <div className="flex gap-2" id={field.name}>
                <ChoiceButton
                  selected={field.state.value === "GOOD"}
                  onClick={() => field.handleChange("GOOD")}
                >
                  <Trans>A good</Trans>
                </ChoiceButton>
                <ChoiceButton
                  selected={field.state.value === "SERVICE"}
                  onClick={() => field.handleChange("SERVICE")}
                >
                  <Trans>A service</Trans>
                </ChoiceButton>
              </div>
            </Field>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Field
              htmlFor={field.name}
              label={t`Description`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id={field.name}
                rows={3}
                className="bg-card"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                maxLength={2000}
              />
            </Field>
          )}
        </form.Field>

        {/* One line for the pair, because they are one figure: fifteen unit
            chips filled a screen of a sheet that has five other fields, and the
            price they qualify sat above the fold on its own. */}
        <form.Field name="pricePerUnit">
          {(priceField) => (
            <form.Field name="unit">
              {(unitField) => (
                <Field
                  htmlFor={priceField.name}
                  label={t`Price per unit in ${priceCurrency}`}
                  // The row's first complaint. Both cannot be shown without
                  // stacking two alerts under a single label.
                  error={
                    getFieldError(priceField.state.meta.errors) ??
                    getFieldError(unitField.state.meta.errors)
                  }
                >
                  <div className="flex gap-2">
                    {/* inputMode, not type="number": a number input lets the
                        browser localise and round, and this value has to reach
                        the database as the exact text that was typed. */}
                    <Input
                      id={priceField.name}
                      dir="ltr"
                      inputMode="decimal"
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-card tabular-nums"
                      value={priceField.state.value}
                      onBlur={priceField.handleBlur}
                      onChange={(event) => priceField.handleChange(event.target.value)}
                      maxLength={64}
                    />
                    <SearchableSelect
                      id={unitField.name}
                      className="w-[8.5rem] shrink-0"
                      options={unitOptions}
                      value={unitField.state.value}
                      onValueChange={unitField.handleChange}
                      ariaLabel={t`Unit`}
                      placeholder={t`Unit`}
                      emptyMessage={t`No units found.`}
                      createLabel={(unit) => t`Use “${unit}”`}
                      normalizeCustomValue={toVocabularyTitleCase}
                      validateCustomValue={validateCustomUnit}
                    />
                  </div>
                </Field>
              )}
            </form.Field>
          )}
        </form.Field>

        {isStorageConfigured ? (
          <form.Field name="imageUrl">
            {(field) => (
              <ImageUploadField
                label={t`Photo`}
                hint={t`Optional`}
                purpose="offering.photo"
                value={field.state.value}
                onChange={(url) => field.handleChange(url)}
                onBusyChange={setPhotoBusy}
                disabled={saving}
              />
            )}
          </form.Field>
        ) : null}
      </div>

      <SheetFooter>
        {/* Disabled while the photo uploads, or submit would persist the URL the
            form held before the new file finished. */}
        <Button type="submit" size="lg" className="w-full" pending={saving || photoBusy}>
          {photoBusy ? (
            <Trans>Uploading photo…</Trans>
          ) : saving ? (
            <Trans>Saving…</Trans>
          ) : offering ? (
            <Trans>Save changes</Trans>
          ) : (
            <Trans>Publish offering</Trans>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={saving}
          onClick={onClose}
        >
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </form>
  );
}

/** A selected-or-not chip. `aria-pressed` is what makes the state audible. */
function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        selected
          ? "h-9 border border-primary bg-primary px-3 text-sm text-primary-foreground"
          : "h-9 border border-border bg-card px-3 text-sm"
      }
    >
      {children}
    </button>
  );
}

function Field({
  htmlFor,
  label,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
