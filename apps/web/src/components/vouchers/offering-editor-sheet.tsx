import type { Offering } from "@clc/api/features/offerings/client";
import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

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
import { useOfferingForm } from "#/features/vouchers/hooks/use-offering-form";
import type { OfferingEditor } from "#/features/vouchers/hooks/use-voucher-offerings-manager";
import { isStorageConfigured } from "#/lib/api/storage";

/**
 * A voucher owner's create and edit surface for their own offerings.
 *
 * A bottom sheet, not a page: the offerings tab behind it is where the result
 * lands, and a full screen would lose that context for a five-field form. Nothing
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
        {/* The inline unit list must not resize the sheet under the tapped input. */}
        <SheetContent className="h-[85dvh]">
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
  const { form, unitOptions, saving, photoBusy, setPhotoBusy, legacyUnit } = useOfferingForm({
    offering,
    voucherAddress,
    defaultImageUrl,
    onClose,
  });

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
                      className="min-w-0 flex-1 bg-card font-mono"
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
        <Button type="submit" tap className="w-full" pending={saving || photoBusy}>
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
          tap
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
