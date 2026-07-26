import { Trans, useLingui } from "@lingui/react/macro";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { Suspense } from "react";

import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { BackChevron, EllipsizedAddress } from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { VoucherAvatar } from "./voucher-avatar";

export function VoucherDetailPage({ voucherAddress }: { voucherAddress: string }) {
  const { t } = useLingui();
  const query = useMarketVoucherDetail(voucherAddress);
  const voucher = query.data;

  if (query.isPending) return <VoucherShell message={t`Loading voucher…`} />;
  if (query.isError || !voucher) {
    return (
      <VoucherShell message={t`Couldn't load this voucher.`}>
        <Button variant="outline" size="sm" className="bg-card" onClick={() => query.refetch()}>
          <Trans>Retry</Trans>
        </Button>
      </VoucherShell>
    );
  }

  const rate = formatVoucherRate(voucher.voucherValue, voucher.voucherUoa);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* The banner is the page's own header, so the back control sits on top of
          it rather than pushing it down the screen. */}
      <div className="relative">
        <VoucherBanner bannerUrl={voucher.bannerUrl} />
        <div className="absolute inset-x-0 top-0 px-4 pt-[env(safe-area-inset-top)]">
          <BackChevron
            label={t`Market`}
            to="/"
            className="text-foreground [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]"
          />
        </div>
      </div>

      <div className="px-6">
        {/* Pulled up so the avatar straddles the banner edge. The ring is the
            page background, so it reads as a cut-out against any banner. */}
        <VoucherAvatar
          address={voucher.address}
          symbol={voucher.symbol}
          iconUrl={voucher.iconUrl}
          size={64}
          className="-mt-8 relative ring-4 ring-background"
        />

        <h1 className="mt-3 font-heading text-[1.75rem] font-bold leading-tight">{voucher.name}</h1>

        {/* Symbol and rate share a row: at 360px a chip beside an h1 would
            either squeeze a long name or wrap onto its own line anyway. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex shrink-0 border border-border bg-card px-2 py-0.5 font-medium font-mono text-[0.75rem] text-muted-foreground">
            {voucher.symbol}
          </span>
          {rate ? (
            <p className="font-mono text-muted-foreground text-sm">
              <Trans>
                1 {voucher.symbol} = {rate.value} {rate.unit}
              </Trans>
            </p>
          ) : null}
        </div>

        {voucher.description ? (
          <p className="mt-4 text-sm leading-relaxed">{voucher.description}</p>
        ) : null}

        <VoucherContactPanel voucher={voucher} />

        <VoucherLocationSection voucher={voucher} />
      </div>
    </div>
  );
}

function VoucherBanner({ bannerUrl }: { bannerUrl: string | null }) {
  // About two thirds of the catalog has no banner, so the gradient is the
  // normal appearance rather than a broken-image placeholder.
  if (!bannerUrl) {
    return (
      <div
        aria-hidden="true"
        className="h-36 w-full bg-gradient-to-br from-primary/25 via-muted to-background"
      />
    );
  }

  return (
    <div aria-hidden="true" className="h-36 w-full overflow-hidden bg-muted">
      <img
        src={bannerUrl}
        alt=""
        loading="eager"
        decoding="async"
        className="size-full object-cover"
      />
    </div>
  );
}

function VoucherContactPanel({
  voucher,
}: {
  voucher: {
    email: string | null;
    website: string | null;
    phone: string | null;
    ownerAddress: string | null;
  };
}) {
  const { t } = useLingui();
  const { email, website, phone, ownerAddress } = voucher;
  if (!email && !website && !phone && !ownerAddress) return null;

  return (
    <div className="mt-5 space-y-2.5 rounded-xl border border-border bg-card p-4">
      {email ? (
        <ContactRow label={t`Email`}>
          <a href={`mailto:${email}`} className="break-all underline underline-offset-2">
            {email}
          </a>
        </ContactRow>
      ) : null}
      {website ? (
        <ContactRow label={t`Website`}>
          {/* Imported third-party link: never hand the referrer or opener over. */}
          <a
            href={website}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all underline underline-offset-2"
          >
            {website}
          </a>
        </ContactRow>
      ) : null}
      {phone ? (
        <ContactRow label={t`Phone`}>
          <a href={`tel:${phone}`} className="underline underline-offset-2">
            {phone}
          </a>
        </ContactRow>
      ) : null}
      {ownerAddress ? (
        <ContactRow label={t`Issuer`}>
          <EllipsizedAddress address={ownerAddress} />
        </ContactRow>
      ) : null}
    </div>
  );
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 text-right text-sm">{children}</span>
    </div>
  );
}

function VoucherLocationSection({
  voucher,
}: {
  voucher: { lat: number | null; lng: number | null; locationName: string | null };
}) {
  const { lat, lng, locationName } = voucher;
  if (lat === null || lng === null) {
    // Without coordinates there is nothing to pin, so show the place name alone
    // rather than a map centred on a default city the voucher is not in.
    return locationName ? (
      <div className="mt-5 rounded-xl border border-border bg-card p-4">
        <p className="text-muted-foreground text-xs">
          <Trans>Location</Trans>
        </p>
        <p className="mt-1 text-sm">{locationName}</p>
      </div>
    ) : null;
  }

  return (
    <div className="mt-5">
      <p className="mb-2 text-muted-foreground text-xs">
        <Trans>Location</Trans>
      </p>
      <Suspense fallback={<div className="h-52 w-full rounded-xl bg-muted" />}>
        <LocationMap lat={lat} lng={lng} />
      </Suspense>
      {locationName ? <p className="mt-2 text-muted-foreground text-sm">{locationName}</p> : null}
    </div>
  );
}

function VoucherShell({ message, children }: { message: string; children?: React.ReactNode }) {
  const { t } = useLingui();
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Market`} to="/" />
      <p className="mt-6 text-muted-foreground text-sm">{message}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
