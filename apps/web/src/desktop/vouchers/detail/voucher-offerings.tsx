import type { Offering } from "@clc/api/features/offerings/client";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";
import { toVocabularyTitleCase, validateCustomUnit } from "@clc/core/features/vocabulary/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import {
  resolveOfferingDisplayPrice,
  useOfferingFrequencyLabel,
} from "#/components/offerings/offering-display";
import type { OfferingVoucherRate } from "#/components/offerings/offerings-panel";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { SearchableSelect } from "#/components/ui/searchable-select";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { Textarea } from "#/components/ui/textarea";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { DeskPanel, DeskSection, deskSectionLinkClass } from "#/desktop/ui/page";
import { useOfferingForm } from "#/features/vouchers/hooks/use-offering-form";
import {
  type OfferingEditor,
  useVoucherOfferingsManager,
} from "#/features/vouchers/hooks/use-voucher-offerings-manager";
import { isStorageConfigured } from "#/lib/api/storage";
import { cn } from "#/lib/utils";

import { VoucherDialog } from "./voucher-dialog";
import { QuotaStatus, useReportSectionCount } from "./voucher-section-bits";

/**
 * One voucher's offerings as tiles: three columns on the page, two in the
 * place panel, a page at a time behind "Load more". The issuer also gets the
 * quota, "Add offering" in the header, and Edit / Remove under each tile.
 */
export function VoucherOfferingsDesk({
  address,
  symbol,
  voucherValue,
  voucherUoa,
  ownerAddress,
  layout,
  onCount,
}: {
  address: string;
  symbol: string;
  voucherValue: string | null;
  voucherUoa: string | null;
  ownerAddress: string | null;
  /** `page`: a titled section, 3 columns. `panel`: under the place panel's tabs, 2 columns. */
  layout: "page" | "panel";
  /** Reports the total once every page has loaded. */
  onCount?: (count: number | undefined) => void;
}) {
  const manager = useVoucherOfferingsManager({ voucherAddress: address, ownerAddress });
  const { isOwner, usage, query, editor, setEditor } = manager;
  const pageSize = layout === "page" ? 6 : 4;
  const [limit, setLimit] = useState(pageSize);
  const offerings = query.data?.pages.flatMap((page) => page.offerings) ?? [];
  const visible = offerings.slice(0, limit);
  const hasMore = limit < offerings.length || query.hasNextPage;
  const rate: OfferingVoucherRate = { value: voucherValue, unit: voucherUoa };
  const quota = usage.data?.offers;
  useReportSectionCount(
    onCount,
    query.isSuccess && !query.hasNextPage ? offerings.length : undefined,
  );

  const allowance = isOwner ? (
    <QuotaStatus quota={quota} pending={usage.isPending} error={usage.isError} />
  ) : null;
  const add = isOwner ? (
    <span className="flex items-center gap-3">
      {usage.isError ? (
        <Button
          type="button"
          variant="ghost"
          pending={usage.isFetching}
          onClick={() => void usage.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null}
      <button
        type="button"
        className={cn(deskSectionLinkClass(), "disabled:cursor-not-allowed disabled:opacity-50")}
        disabled={!manager.canCreate}
        onClick={() => setEditor({ kind: "create" })}
      >
        <Trans>Add offering</Trans>
      </button>
    </span>
  ) : null;

  const body = (
    <div className="grid gap-3">
      {quota && !quota.canCreate ? (
        <p className="text-xs text-destructive">
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      ) : null}
      {query.isPending ? (
        <div className={cn("grid gap-4", layout === "page" ? "grid-cols-3" : "grid-cols-2")}>
          {Array.from({ length: layout === "page" ? 3 : 2 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5] rounded-none" />
          ))}
        </div>
      ) : query.isError ? (
        <DeskPanel className="grid justify-items-start gap-3">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load offerings.</Trans>
          </p>
          <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </DeskPanel>
      ) : offerings.length === 0 ? (
        <DeskPanel>
          <p className="text-sm text-muted-foreground">
            <Trans>No offerings yet</Trans>
          </p>
        </DeskPanel>
      ) : (
        <div
          className={cn(
            "grid auto-rows-fr gap-4",
            layout === "page" ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          {visible.map((offering) => (
            <OfferingTile
              key={offering.id}
              offering={offering}
              rate={rate}
              linkToVoucher={layout === "panel"}
              management={
                isOwner
                  ? {
                      onEdit: () => setEditor({ kind: "edit", offering }),
                      onDelete: () => void manager.requestDelete(offering),
                      deleting: manager.deletingID === offering.id,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {hasMore && offerings.length > 0 ? (
        <Button
          variant="outline"
          className="justify-self-start"
          pending={query.isFetchingNextPage}
          onClick={() => {
            if (limit >= offerings.length && query.hasNextPage) {
              void Promise.resolve(query.fetchNextPage()).then(() =>
                setLimit((current) => current + pageSize),
              );
              return;
            }
            setLimit((current) => current + pageSize);
          }}
        >
          {query.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
        </Button>
      ) : null}
      <OfferingFormDialog
        editor={editor}
        voucherAddress={address}
        priceCurrency={voucherUoa ?? symbol}
        defaultImageUrl={manager.defaultImageUrl}
        onClose={() => setEditor(null)}
      />
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="grid gap-3">
        {isOwner ? (
          <div className="flex h-[30px] items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <Trans>Offerings</Trans>
              {allowance}
            </span>
            {add}
          </div>
        ) : null}
        {body}
      </div>
    );
  }
  return (
    <DeskSection
      title={<Trans>Offerings</Trans>}
      action={
        isOwner ? (
          <span className="flex min-w-0 items-center gap-3">
            {allowance}
            {add}
          </span>
        ) : null
      }
    >
      {body}
    </DeskSection>
  );
}

function offeringInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toLocaleUpperCase() || "OF"
  );
}

/** The photo, or a seeded monogram when there is none or it failed to load. */
function OfferingPicture({ offering, className }: { offering: Offering; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const candidate = offering.imageUrl ?? offering.voucherImageUrl ?? null;
  const src = candidate && failed !== candidate ? candidate : null;
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {src ? (
        <ProgressiveImage
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center font-heading text-2xl font-bold text-white"
          style={{ background: hueFromSeed(offering.id) }}
        >
          {offeringInitials(offering.name)}
        </span>
      )}
    </span>
  );
}

function useOfferingFigures(offering: Offering, rate: OfferingVoucherRate) {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const price = resolveOfferingDisplayPrice(offering, rate, locale);
  const hasFixedPrice = formatOfferingPrice(offering.pricePerUnit) !== null;
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const quantityNumber = quantity ? Number(quantity.value) : 0;
  const quantityValue =
    quantity && quantity.value.length > 6 && Number.isFinite(quantityNumber)
      ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
          quantityNumber,
        )
      : quantity?.value;
  const frequency = useOfferingFrequencyLabel(offering.frequency);
  const priceLabel: ReactNode = price ? (
    `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
  ) : hasFixedPrice ? (
    <Trans>Price unavailable</Trans>
  ) : (
    <Trans>Price on request</Trans>
  );
  return { price, priceLabel, quantity, quantityValue, frequency };
}

function OfferingTile({
  offering,
  rate,
  linkToVoucher,
  management,
}: {
  offering: Offering;
  rate: OfferingVoucherRate;
  linkToVoucher: boolean;
  management?: { onEdit: () => void; onDelete: () => void; deleting: boolean };
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { price, priceLabel, quantity, quantityValue, frequency } = useOfferingFigures(
    offering,
    rate,
  );
  return (
    <div className="flex min-w-0 flex-col border border-border bg-card">
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-start outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
        aria-label={t`View offering details: ${offering.name}`}
        onClick={() => setOpen(true)}
      >
        <OfferingPicture offering={offering} className="aspect-[4/3] w-full" />
        <span className="grid gap-0.5 p-3">
          <span className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
            {offering.name}
          </span>
          <span
            dir={price ? "ltr" : undefined}
            className={cn(
              "truncate text-start",
              price ? "font-mono text-sm font-semibold" : "text-xs text-muted-foreground",
            )}
          >
            {priceLabel}
          </span>
          {quantityValue || frequency ? (
            <span className="truncate text-xs text-muted-foreground">
              {quantityValue ? <span className="font-mono">{quantityValue}</span> : null}
              {quantityValue && quantity?.unit ? ` ${quantity.unit}` : null}
              {quantityValue && frequency ? <span aria-hidden="true"> · </span> : null}
              {frequency}
            </span>
          ) : null}
        </span>
      </button>
      {management ? (
        <div className="grid grid-cols-2 border-border border-t">
          <Button
            type="button"
            variant="ghost"
            className="w-full border-border border-e"
            onClick={management.onEdit}
          >
            <Trans>Edit</Trans>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive"
            pending={management.deleting}
            onClick={management.onDelete}
          >
            {management.deleting ? <Trans>Removing…</Trans> : <Trans>Remove</Trans>}
          </Button>
        </div>
      ) : null}
      <VoucherDialog
        open={open}
        onOpenChange={setOpen}
        title={offering.name}
        bodyClassName="p-0 gap-0"
        footer={
          linkToVoucher ? (
            <Button asChild>
              <Link
                to="/vouchers/$voucherAddress"
                params={{ voucherAddress: offering.voucherAddress }}
                search={{}}
              >
                <Trans>Open voucher page</Trans>
              </Link>
            </Button>
          ) : undefined
        }
      >
        <OfferingPicture offering={offering} className="aspect-video w-full" />
        <div className="grid gap-3 p-4">
          <p
            dir={price ? "ltr" : undefined}
            className={cn(
              "text-start",
              price ? "font-mono text-sm font-semibold" : "text-sm text-muted-foreground",
            )}
          >
            {priceLabel}
          </p>
          {offering.description ? (
            <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
              {offering.description}
            </p>
          ) : null}
          {offering.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {offering.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} size="sm" />
              ))}
            </div>
          ) : null}
        </div>
      </VoucherDialog>
    </div>
  );
}

/** Add or edit an offering: the sheet's fields and rules, in a dialog. */
function OfferingFormDialog({
  editor,
  voucherAddress,
  priceCurrency,
  defaultImageUrl,
  onClose,
}: {
  editor: OfferingEditor | null;
  voucherAddress: string;
  priceCurrency: string;
  defaultImageUrl: string | null;
  onClose: () => void;
}) {
  const offering = editor?.kind === "edit" ? editor.offering : null;
  return (
    <VoucherDialog
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={offering ? <Trans>Edit offering</Trans> : <Trans>Add offering</Trans>}
      bodyClassName="p-0"
    >
      {editor ? (
        // Keyed on the record: TanStack Form reads defaultValues once.
        <OfferingForm
          key={offering?.id ?? "create"}
          offering={offering}
          voucherAddress={voucherAddress}
          priceCurrency={priceCurrency}
          defaultImageUrl={defaultImageUrl}
          onClose={onClose}
        />
      ) : null}
    </VoucherDialog>
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
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-4 px-4 pt-4">
        {legacyUnit ? (
          <p className="border border-border bg-muted/40 p-3 text-sm">
            <Trans>
              This listing was imported with the unit “{legacyUnit}”. Pick one below to save your
              changes.
            </Trans>
          </p>
        ) : null}
        <form.Field name="name">
          {(field) => (
            <Field
              htmlFor="desk-offering-name"
              label={t`What are you offering?`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="desk-offering-name"
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
              htmlFor="desk-offering-description"
              label={t`Description`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id="desk-offering-description"
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
        <form.Field name="pricePerUnit">
          {(priceField) => (
            <form.Field name="unit">
              {(unitField) => (
                <Field
                  htmlFor="desk-offering-price"
                  label={t`Price per unit in ${priceCurrency}`}
                  error={
                    getFieldError(priceField.state.meta.errors) ??
                    getFieldError(unitField.state.meta.errors)
                  }
                >
                  <div className="flex gap-2">
                    <Input
                      id="desk-offering-price"
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
                      id="desk-offering-unit"
                      className="w-40 shrink-0"
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
      <div className="sticky bottom-0 flex justify-end gap-2 border-border border-t bg-card p-4">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        {/* Disabled while the photo uploads, or submit would persist the URL the
            form held before the new file finished. */}
        <Button type="submit" pending={saving || photoBusy}>
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
      </div>
    </form>
  );
}
