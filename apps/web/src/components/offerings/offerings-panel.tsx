import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayTotal,
  formatOfferingQuantity,
} from "@clc/core/features/market/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { RiAddLine, RiShoppingCartLine, RiSubtractLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import type { Offering, OfferingFrequency } from "@clc/api/features/offerings/client";
import { cn } from "#/lib/utils";

/**
 * The shape both offering screens' infinite queries satisfy. Declared
 * structurally rather than importing `UseInfiniteQueryResult` so this component
 * stays a view: it reads a query, it does not own or create one.
 */
type OfferingsQueryLike = {
  data?: { pages: { offerings: Offering[] }[] };
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
};

/**
 * One offering catalog, rendered identically wherever it is reached from.
 *
 * A voucher page and a pool page show the same tiles opening the same sheet, so
 * the grid lives here rather than in either feature — sibling features cannot
 * import each other's `ui/`, and two copies of a buying surface would drift.
 * Callers supply their own query and empty-state copy, which is all that
 * legitimately differs between them.
 */
/**
 * What a voucher owner can do to a row, when the caller is a screen that knows
 * who is looking.
 *
 * Passed in rather than derived here, so this stays a read component. The pool
 * offerings view renders the same tiles for vouchers it does not own, and pulling
 * a voucher-owner hook in here would make ownership a concern of every screen
 * that lists an offering.
 */
export type OfferingManagement = {
  onEdit: (offering: Offering) => void;
  onDelete: (offering: Offering) => void;
  /** The row currently being unlisted, if any. */
  deletingID?: string | null;
};

export type OfferingVoucherRate = {
  value: string | null;
  unit: string | null;
};

export function OfferingsPanel({
  query,
  emptyState,
  showVoucher = false,
  fallbackSymbol,
  suppressed = false,
  management,
  resolveVoucherRate,
  ...props
}: ComponentProps<"div"> & {
  query: OfferingsQueryLike;
  /** Feature-specific copy: "nothing for this voucher" vs "nothing in this pool". */
  emptyState: ReactNode;
  /** A pool's offerings come from many vouchers, so each tile names its own. */
  showVoucher?: boolean;
  /** Used only when a row arrives with no voucher symbol of its own. */
  fallbackSymbol?: string;
  /** The caller already knows the result is empty and issued no request. */
  suppressed?: boolean;
  /** Present only for a voucher's own owner. Absent means read-only. */
  management?: OfferingManagement;
  /** Resolves the voucher conversion attached to this row's parent voucher. */
  resolveVoucherRate?: (offering: Offering) => OfferingVoucherRate | null;
}) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const offerings = query.data?.pages.flatMap((page) => page.offerings) ?? [];

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      suppressed ||
      !query.hasNextPage ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [suppressed, query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  return (
    <div {...props}>
      {suppressed ? <OfferingsEmptyState>{emptyState}</OfferingsEmptyState> : null}

      {!suppressed && query.isPending ? (
        <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
          <Trans>Loading offerings…</Trans>
        </div>
      ) : null}

      {!suppressed && query.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>Couldn't load offerings.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={() => query.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}

      {!suppressed && query.isSuccess && offerings.length === 0 ? (
        <OfferingsEmptyState>{emptyState}</OfferingsEmptyState>
      ) : null}

      {/* auto-rows-fr so every row is the same height, not just every tile within
          a row: the grid reads as one matrix regardless of how many text lines
          each offering happens to have. */}
      {offerings.length > 0 ? (
        <div className="grid auto-rows-fr grid-cols-2 gap-2">
          {offerings.map((offering) => (
            <OfferingTile
              key={offering.id}
              offering={offering}
              voucherSymbol={offering.voucherSymbol ?? fallbackSymbol ?? "VOUCHER"}
              showVoucher={showVoucher}
              management={management}
              voucherRate={resolveVoucherRate?.(offering) ?? null}
            />
          ))}
        </div>
      ) : null}

      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {query.isFetchingNextPage ? (
        <p className="py-3 text-center text-muted-foreground text-xs">
          <Trans>Loading more…</Trans>
        </p>
      ) : null}
    </div>
  );
}

function OfferingsEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="font-heading text-sm font-semibold">
        <Trans>No offerings yet</Trans>
      </p>
      <p className="mt-1 text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

function OfferingTile({
  offering,
  voucherSymbol,
  showVoucher,
  management,
  voucherRate,
}: {
  offering: Offering;
  voucherSymbol: string;
  showVoucher: boolean;
  management?: OfferingManagement;
  voucherRate: OfferingVoucherRate | null;
}) {
  const { i18n, t } = useLingui();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageUrl =
    offering.imageUrl && failedImage !== offering.imageUrl ? offering.imageUrl : null;
  const price = formatOfferingDisplayPrice(
    offering.pricePerUnit,
    voucherRate?.value ?? null,
    voucherRate?.unit ?? null,
    voucherSymbol,
  );
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const quantityNumber = quantity ? Number(quantity.value) : 0;
  const quantityValue =
    quantity && quantity.value.length > 6 && Number.isFinite(quantityNumber)
      ? new Intl.NumberFormat(i18n.locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(quantityNumber)
      : quantity?.value;
  const frequency = useOfferingFrequencyLabel(offering.frequency);
  const initials = offeringInitials(offering.name);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex min-w-0 flex-col overflow-hidden border border-border bg-card text-left active:bg-muted"
        aria-label={t`View offering details: ${offering.name}`}
        onClick={() => setDetailsOpen(true)}
      >
        {/* One fixed height for every offering's image, whatever the tile around
            it does. A grid row stretches its tiles to the tallest one, and an
            `aspect-ratio` height is only a preference — so a tile with fewer text
            lines used to hand its slack to the image, and neighbouring images
            came out different heights. The height is pinned and `object-cover`
            crops; the text below absorbs the slack instead. */}
        <span
          data-slot="offering-media"
          className="relative block h-36 w-full shrink-0 overflow-hidden bg-muted"
        >
          <OfferingImage
            imageUrl={imageUrl}
            initials={initials}
            seed={offering.id}
            initialsClassName="text-3xl"
            onError={() => setFailedImage(imageUrl)}
          />
        </span>
        <span className="block min-h-[4.5rem] flex-1 p-2">
          {/* Which voucher this is bought with, in the same blue the wallet uses
              for Pools. Mono and verbatim, like every other symbol in the app:
              issuer-authored identifiers are not re-cased (USDm, USD₮, GE KSH). */}
          {showVoucher ? (
            <span
              data-slot="offering-voucher"
              className="mb-0.5 block truncate font-mono text-[0.625rem] font-semibold text-info"
            >
              {voucherSymbol}
            </span>
          ) : null}
          <span className="line-clamp-2 font-heading text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
            {offering.name}
          </span>
          {/* Currency code, slash and issuer-authored unit are all data. The
              amount is converted through the voucher's recorded rate; a legacy
              voucher without one falls back to its own symbol. */}
          <span className="mt-1 block truncate font-mono text-[0.6875rem] font-semibold text-primary">
            {price ? (
              `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
            ) : (
              <Trans>Price on request</Trans>
            )}
          </span>
          {quantityValue || frequency ? (
            <span className="block truncate text-[0.6875rem] text-muted-foreground">
              {quantityValue}
              {quantityValue && quantity?.unit ? ` ${quantity.unit}` : null}
              {quantityValue && frequency ? <span aria-hidden="true"> · </span> : null}
              {frequency}
            </span>
          ) : null}
        </span>
      </button>

      {/* Outside the tile's button, not inside it: nesting a button in a button is
          invalid, and a tap meant for Edit must not also open the buying sheet. */}
      {management ? (
        <span data-slot="offering-actions" className="flex border-x border-b border-border">
          <button
            type="button"
            className="flex-1 border-r border-border bg-card py-2 text-[0.6875rem] font-semibold"
            onClick={() => management.onEdit(offering)}
          >
            <Trans>Edit</Trans>
          </button>
          <button
            type="button"
            className="flex-1 bg-card py-2 text-[0.6875rem] font-semibold text-destructive"
            disabled={management.deletingID === offering.id}
            onClick={() => management.onDelete(offering)}
          >
            {management.deletingID === offering.id ? (
              <Trans>Removing…</Trans>
            ) : (
              <Trans>Remove</Trans>
            )}
          </button>
        </span>
      ) : null}

      <OfferingDetailsSheet
        offering={offering}
        voucherSymbol={voucherSymbol}
        imageUrl={imageUrl}
        initials={initials}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onImageError={() => setFailedImage(imageUrl)}
        voucherRate={voucherRate}
      />
    </div>
  );
}

/**
 * The buying surface for one offering: what it is, how many, what that costs.
 *
 * Dismissal is the backdrop, not a labelled button. Base UI closes a dialog on
 * an outside press by default (`disablePointerDismissal` is false), so the only
 * close control left is a screen-reader one — a modal dialog traps focus, and
 * touch screen readers cannot reach the backdrop to escape it.
 */
function OfferingDetailsSheet({
  offering,
  voucherSymbol,
  imageUrl,
  initials,
  open,
  onOpenChange,
  onImageError,
  voucherRate,
}: {
  offering: Offering;
  voucherSymbol: string;
  imageUrl: string | null;
  initials: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageError: () => void;
  voucherRate: OfferingVoucherRate | null;
}) {
  const { t } = useLingui();
  const [count, setCount] = useState(1);
  const price = formatOfferingDisplayPrice(
    offering.pricePerUnit,
    voucherRate?.value ?? null,
    voucherRate?.unit ?? null,
    voucherSymbol,
  );
  const total = formatOfferingDisplayTotal(
    offering.pricePerUnit,
    voucherRate?.value ?? null,
    voucherRate?.unit ?? null,
    voucherSymbol,
    count,
  );

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        // Nothing is committed on close, so a reopened sheet starts at one
        // rather than resuming a quantity the user walked away from.
        if (next) setCount(1);
        onOpenChange(next);
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
          <SheetClose className="sr-only">
            <Trans>Close</Trans>
          </SheetClose>

          {/* A wide, shallow crop: the sheet has width to spare and height to
              protect, and the stepper and total have to stay reachable. */}
          <span
            data-slot="offering-media"
            className="relative mt-3 block h-40 w-full shrink-0 overflow-hidden bg-muted"
          >
            <OfferingImage
              imageUrl={imageUrl}
              initials={initials}
              seed={offering.id}
              initialsClassName="text-5xl"
              onError={onImageError}
            />
          </span>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <SheetHeader className="px-6 pt-4 pb-0">
              <SheetTitle className="font-heading text-xl font-semibold leading-tight [overflow-wrap:anywhere]">
                {offering.name}
              </SheetTitle>
              <p className="font-mono text-sm font-semibold text-primary">
                {price ? (
                  `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
                ) : (
                  <Trans>Price on request</Trans>
                )}
              </p>
            </SheetHeader>

            {offering.description ? (
              <div className="mx-6 mt-3 border border-border bg-card p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {offering.description}
                </p>
              </div>
            ) : null}

            {offering.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 px-6">
                {offering.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            ) : null}

            <div className="mx-6 mt-4 border border-border bg-card">
              {/* Both rows are h-14 so the stepper and the total read as one
                  control. The buttons stay 44px rather than shrinking to fit a
                  shorter row: they are the only touch targets in the sheet
                  besides the CTA. */}
              <div className="flex h-14 items-center justify-between gap-3 px-3">
                <span className="text-sm">
                  <Trans>Quantity</Trans>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 bg-card"
                    aria-label={t`Decrease quantity`}
                    disabled={count <= 1}
                    onClick={() => setCount((current) => Math.max(1, current - 1))}
                  >
                    <RiSubtractLine className="size-4" aria-hidden="true" />
                  </Button>
                  {/* An output is announced on change, so the stepper reports
                      the new quantity without a separate live region. */}
                  <output className="w-9 text-center font-heading text-base font-semibold tabular-nums">
                    {count}
                  </output>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 bg-card"
                    aria-label={t`Increase quantity`}
                    onClick={() => setCount((current) => current + 1)}
                  >
                    <RiAddLine className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {total ? (
                <div className="flex h-14 items-center justify-between gap-3 border-t border-border px-3">
                  <span className="text-sm">
                    <Trans>Total</Trans>
                  </span>
                  <span className="font-mono text-lg font-semibold text-primary">
                    {total.value} {total.unit}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <SheetFooter className="px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button
              className="h-11 w-full"
              onClick={() => {
                // Placeholder until the cart lands: a primary action that
                // silently does nothing reads as a broken screen.
                onOpenChange(false);
                toast.info(t`The cart isn't ready yet.`);
              }}
            >
              <RiShoppingCartLine className="size-4" aria-hidden="true" />
              <Trans>Add to cart</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

/**
 * An offering's photo, or a seeded monogram when it has none or the fetch
 * failed. 44% of the imported catalog has no image, so the fallback is a normal
 * state rather than an error surface.
 */
function OfferingImage({
  imageUrl,
  initials,
  seed,
  initialsClassName,
  onError,
}: {
  imageUrl: string | null;
  initials: string;
  seed: string;
  initialsClassName: string;
  onError: () => void;
}) {
  if (imageUrl) {
    return (
      <ProgressiveImage
        src={imageUrl}
        alt=""
        loading="lazy"
        className="size-full object-cover"
        onError={onError}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-center font-heading font-bold text-white",
        initialsClassName,
      )}
      style={{ background: hueFromSeed(seed) }}
    >
      {initials}
    </span>
  );
}

/** Up to two initials from issuer-authored, sometimes non-Latin, free text. */
function offeringInitials(commodityName: string): string {
  return (
    commodityName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toLocaleUpperCase() || "OF"
  );
}

function useOfferingFrequencyLabel(frequency: OfferingFrequency | null): string | null {
  const { t } = useLingui();
  switch (frequency) {
    case "day":
      return t`Daily`;
    case "week":
      return t`Weekly`;
    case "month":
      return t`Monthly`;
    case "year":
      return t`Yearly`;
    case null:
      return null;
  }
}
