import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { recipientLabel as formatRecipientLabel } from "@clc/api/features/recipients/client";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useAddressBookRecipients } from "#/features/wallet/hooks/use-address-book";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { useSendShare } from "#/features/wallet/hooks/use-send-share";
import { CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { ShareReceiptButton } from "./share-receipt-button";

export type TransferDetails = {
  txHash: string;
  direction: "IN" | "OUT";
  senderAddress: string;
  recipientAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  amount: string;
  uoaValue?: string;
  uoa?: string;
  dateBlock: string;
  success: boolean;
};

export function TransferDetailsSheet({
  transfer,
  open,
  onOpenChange,
}: {
  transfer: TransferDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n, t } = useLingui();
  const created = transfer ? isVoucherCreationTransfer(transfer) : false;
  const badge = created
    ? t`Created voucher`
    : transfer?.direction === "IN"
      ? t`Received voucher`
      : t`Sent voucher`;
  const status = transfer?.success ? t`Confirmed` : t`Failed`;
  const transferDate = transfer
    ? formatTransferDate(transfer.dateBlock, i18n.locales?.[0] ?? i18n.locale)
    : "";
  const explorerUrl = transfer ? explorerTxUrl(CHAIN_INFO, transfer.txHash) : "#";
  const shareQuery = useSendShare(
    transfer?.txHash ?? null,
    open && transfer?.success === true && !created,
  );
  const senderIdentity = useReverseRecipientResolution(
    transfer && !created ? transfer.senderAddress : null,
  );
  const recipientIdentity = useReverseRecipientResolution(transfer?.recipientAddress ?? null);
  const addressBook = useAddressBookRecipients(useStorageOwner());
  const addressBookLabel = (address: string) =>
    (addressBook.data ?? []).find(
      (entry) =>
        entry.address.toLowerCase() === address.toLowerCase() &&
        !entry.label.toLowerCase().startsWith("0x"),
    )?.label ?? null;
  const senderAlias = transfer && !created ? addressBookLabel(transfer.senderAddress) : null;
  const recipientAlias = transfer ? addressBookLabel(transfer.recipientAddress) : null;
  const senderLabel = transfer
    ? senderIdentity.data
      ? formatRecipientLabel(senderIdentity.data)
      : (senderAlias ?? transfer.senderAddress)
    : undefined;
  const recipientLabel = recipientIdentity.data
    ? formatRecipientLabel(recipientIdentity.data)
    : (recipientAlias ?? transfer?.recipientAddress);
  const tokenAmountLabel = transfer
    ? `${formatTokenAmount(transfer.amount, transfer.tokenDecimals)} ${transfer.tokenSymbol}`
    : "";
  const uoaLabel = transfer
    ? formatTransferUnitValue(transfer.uoaValue, transfer.uoa, i18n.locales?.[0] ?? i18n.locale)
    : null;
  const amountLabel = uoaLabel ? `${tokenAmountLabel} (${uoaLabel})` : tokenAmountLabel;

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="max-h-[85svh] overflow-y-auto rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge className="h-6 px-2 text-[0.625rem] uppercase tracking-[0.08em]">{badge}</Badge>
            <SheetTitle className="sr-only">
              <Trans>Transaction details</Trans>
            </SheetTitle>
          </SheetHeader>

          {transfer ? (
            <div className="px-6 pb-2">
              <div className="border border-border bg-card">
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Status</Trans>
                  </span>
                  <Badge
                    variant={transfer.success ? "primary" : "muted"}
                    className="h-5 px-2 text-[0.625rem] uppercase tracking-[0.06em]"
                  >
                    {status}
                  </Badge>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </span>
                  <span className="text-end font-mono text-xs font-semibold">
                    <span className="block">
                      {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}{" "}
                      <Link
                        to="/vouchers/$voucherAddress"
                        params={{ voucherAddress: transfer.tokenAddress.toLowerCase() }}
                        search={{ from: "wallet" }}
                        aria-label={t`View voucher`}
                        className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <bdi dir="ltr">{transfer.tokenSymbol}</bdi>
                      </Link>
                    </span>
                    {uoaLabel ? (
                      <span className="block text-muted-foreground">({uoaLabel})</span>
                    ) : null}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Date</Trans>
                  </span>
                  <time className="font-mono text-xs font-semibold" dateTime={transfer.dateBlock}>
                    {transferDate}
                  </time>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>From</Trans>
                  </span>
                  {created ? (
                    <span className="text-xs font-semibold">
                      <Trans>New supply</Trans>
                    </span>
                  ) : (
                    <RecipientIdentityLabel
                      address={transfer.senderAddress}
                      fallback={senderAlias ?? undefined}
                      showAddress
                    />
                  )}
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>To</Trans>
                  </span>
                  <RecipientIdentityLabel
                    address={transfer.recipientAddress}
                    fallback={recipientAlias ?? undefined}
                    showAddress
                  />
                </div>
              </div>
            </div>
          ) : null}

          <PrivateShareSection query={shareQuery} />

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {transfer?.success && transfer.txHash ? (
              <ShareReceiptButton
                key={transfer.txHash}
                className="h-11 w-full"
                title={created ? t`Voucher creation receipt` : t`Payment receipt`}
                lines={[
                  created
                    ? t`I created ${amountLabel}.`
                    : transfer.direction === "OUT"
                      ? t`I sent ${amountLabel} to ${recipientLabel}.`
                      : t`I received ${amountLabel} from ${senderLabel}.`,
                  ...(transfer.direction === "OUT" && recipientLabel !== transfer.recipientAddress
                    ? [`${t`Address`}: ${transfer.recipientAddress}`]
                    : []),
                  ...(!created &&
                  transfer.direction === "IN" &&
                  senderLabel !== transfer.senderAddress
                    ? [`${t`Address`}: ${transfer.senderAddress}`]
                    : []),
                  ...(transferDate ? [transferDate] : []),
                ]}
                url={explorerUrl}
              />
            ) : null}
            <Button asChild className="h-11 w-full">
              <a href={explorerUrl} target="_blank" rel="noreferrer">
                <Trans>View on block explorer</Trans>
              </a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PrivateShareSection({ query }: { query: ReturnType<typeof useSendShare> }) {
  const share = query.data;

  if (query.isPending && query.fetchStatus !== "idle") {
    return (
      <div className="px-6 pb-2 text-muted-foreground text-xs">
        <Trans>Loading private attachment…</Trans>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="px-6 pb-2 text-destructive text-xs">
        <Trans>Couldn't load the private attachment.</Trans>
      </div>
    );
  }
  if (!share) return null;

  return (
    <section className="px-6 pb-2" aria-label="Private attachment">
      <div className="space-y-3 border border-border bg-card p-3">
        <div>
          <p className="font-semibold text-sm">
            <Trans>Private attachment</Trans>
          </p>
          <p className="text-muted-foreground text-xs">
            <Trans>Shared by {share.sharedBy.name}</Trans>
          </p>
        </div>

        {share.note ? (
          <p
            dir="auto"
            className="whitespace-pre-wrap break-words border-s-2 border-primary ps-3 text-sm"
          >
            {share.note}
          </p>
        ) : null}

        <div className="space-y-2 text-xs">
          {share.sharedBy.email ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                <Trans>Email</Trans>
              </span>
              <a
                className="break-all font-semibold text-primary"
                href={`mailto:${share.sharedBy.email}`}
              >
                {share.sharedBy.email}
              </a>
            </div>
          ) : null}
          {share.sharedBy.phone ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                <Trans>Phone</Trans>
              </span>
              <a className="font-semibold text-primary" href={`tel:${share.sharedBy.phone}`}>
                {share.sharedBy.phone}
              </a>
            </div>
          ) : null}
          {share.sharedBy.location ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">
                  <Trans>Location</Trans>
                </span>
                <span className="text-end font-semibold">
                  {share.sharedBy.location.locationName}
                </span>
              </div>
              <Suspense fallback={<div className="h-36 w-full bg-muted" />}>
                <LocationMap
                  lat={share.sharedBy.location.lat}
                  lng={share.sharedBy.location.lng}
                  className="h-36 rounded-none"
                />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
