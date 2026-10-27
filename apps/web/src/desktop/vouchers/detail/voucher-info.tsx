import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";
import { RiNavigationLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { Skeleton } from "#/components/ui/skeleton";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskPanel } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { openDefaultMaps } from "#/lib/default-maps";

import { VoucherOwnerControls } from "./voucher-controls";

/** Whether the viewer may edit this voucher's catalog record: its manager, or a superadmin. */
export function useCanEditVoucher(address: string, detail: MarketVoucherDetail | undefined) {
  const auth = useAuthStatus();
  const ownerInfo = useAssetOwnerInfo(address, detail?.ownerAddress);
  const canEdit =
    auth.isAuthenticated &&
    !!detail &&
    (auth.session?.role === "SUPERADMIN" ||
      (!!auth.session?.address && !!detail.ownerAddress && ownerInfo.canManage));
  return { canEdit, ownerInfo: ownerInfo.info };
}

/**
 * The Info column: the rate and description, the facts as label/value rows,
 * the location map, and the issuer's controls at the foot. Signed-in only,
 * as on the phone: its private query never runs for a visitor.
 */
export function VoucherInfoDesk({
  address,
  symbol,
  decimals,
  ownerAddress,
  detail,
  privateInfo,
}: {
  address: string;
  symbol: string;
  decimals?: number;
  ownerAddress: string | null;
  detail: MarketVoucherDetail | undefined;
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
}) {
  return (
    <AuthenticatedDetailsGate className="border border-border bg-card p-4">
      <VoucherInfoBody
        address={address}
        symbol={symbol}
        decimals={decimals}
        ownerAddress={ownerAddress}
        detail={detail}
        privateInfo={privateInfo}
      />
    </AuthenticatedDetailsGate>
  );
}

function VoucherInfoBody({
  address,
  symbol: voucherSymbol,
  decimals,
  ownerAddress,
  detail,
  privateInfo,
}: {
  address: string;
  symbol: string;
  decimals?: number;
  ownerAddress: string | null;
  detail: MarketVoucherDetail | undefined;
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const { address: walletAddress } = useConnection();
  const { canEdit, ownerInfo } = useCanEditVoucher(address, detail);

  if (privateInfo?.isPending || !detail) {
    return (
      <div aria-busy="true" className="grid gap-2 border border-border bg-card p-4">
        <Skeleton className="h-4 w-2/3 rounded-none" />
        <Skeleton className="h-4 w-1/2 rounded-none" />
      </div>
    );
  }
  if (privateInfo?.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-3 border border-border bg-card p-4">
        <p className="text-sm">
          <Trans>Couldn't load voucher information.</Trans>
        </p>
        <Button variant="outline" pending={privateInfo.isFetching} onClick={privateInfo.retry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  const rate = formatVoucherRate(detail.voucherValue, detail.voucherUoa);
  const symbol = detail.symbol || voucherSymbol;
  const contractAddress = detail.address || address;
  const issuer = ownerAddress ?? detail.ownerAddress;
  const lat = detail.lat;
  const lng = detail.lng;
  const hasCoordinates = typeof lat === "number" && typeof lng === "number";
  const locationLabel = detail.locationName ?? (hasCoordinates ? `${lat}, ${lng}` : null);
  const terms = detail.terms;
  const link = "max-w-full truncate underline-offset-2 hover:underline";

  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy contract address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Contract address copied`))
      .catch(() => toast.error(t`Couldn't copy contract address`));
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {rate || detail.description ? (
        <div className="grid gap-1 border border-border bg-card px-4 py-3.5">
          {rate ? (
            <p dir="ltr" className="text-start font-heading text-sm font-semibold">
              <Trans>
                1 {symbol} = {rate.value} {rate.unit}
              </Trans>
            </p>
          ) : null}
          {detail.description ? (
            <p dir="auto" className="text-sm leading-relaxed text-muted-foreground">
              {detail.description}
            </p>
          ) : null}
        </div>
      ) : null}

      <DeskKV
        rows={[
          [
            t`Contract`,
            <CopyableInfoValue
              key="contract"
              value={contractAddress}
              label={t`Copy contract address`}
              onCopy={copy}
            />,
          ],
          detail.email
            ? [
                t`Email`,
                <a key="email" href={`mailto:${detail.email}`} className={link}>
                  {detail.email}
                </a>,
              ]
            : null,
          [
            t`Website`,
            detail.website ? (
              <a
                key="website"
                href={detail.website}
                target="_blank"
                rel="noreferrer noopener"
                className={link}
              >
                {detail.website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              "—"
            ),
          ],
          detail.phone
            ? [
                t`Phone`,
                <a key="phone" href={`tel:${detail.phone}`} className={link} dir="ltr">
                  {detail.phone}
                </a>,
              ]
            : null,
          terms && isHttpUrl(terms)
            ? [
                t`Terms`,
                <a
                  key="terms"
                  href={terms}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={link}
                >
                  {terms.replace(/^https?:\/\//, "")}
                </a>,
              ]
            : null,
          [
            t`Issuer`,
            issuer ? (
              <span key="issuer" className="grid min-w-0 gap-0.5">
                <span className="truncate">
                  <RecipientIdentityLabel address={issuer} />
                </span>
                <span className="font-sans font-normal">
                  <MultisigOwnerNotice info={ownerInfo} />
                </span>
              </span>
            ) : (
              "—"
            ),
          ],
        ]}
      />

      {terms && !isHttpUrl(terms) ? (
        <DeskPanel>
          <p className="text-sm font-semibold">
            <Trans>Terms</Trans>
          </p>
          <MarkdownContent className="mt-2">{terms}</MarkdownContent>
        </DeskPanel>
      ) : null}

      {locationLabel ? (
        <div className="border border-border bg-card">
          {hasCoordinates ? (
            <Suspense fallback={<Skeleton className="h-[150px] w-full rounded-none" />}>
              <LocationMap lat={lat} lng={lng} className="h-[150px] rounded-none border-0" />
            </Suspense>
          ) : null}
          <div className="flex min-w-0 items-center justify-between gap-3 border-border border-t px-3.5 py-2.5 first:border-t-0">
            <span dir="auto" className="min-w-0 truncate text-xs">
              {locationLabel}
            </span>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => openDefaultMaps({ label: detail.locationName, lat, lng })}
            >
              <RiNavigationLine aria-hidden="true" />
              <Trans>Open in Maps</Trans>
            </Button>
          </div>
        </div>
      ) : null}

      <VoucherOwnerControls
        tokenAddress={contractAddress}
        tokenSymbol={symbol}
        tokenDecimals={detail.decimals ?? decimals}
        ownerAddress={issuer}
        walletAddress={walletAddress}
        requesterAddress={auth.session?.address}
        editable={canEdit ? detail : null}
      />
    </div>
  );
}
