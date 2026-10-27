import { buildOfferingOrderNote } from "@clc/core/features/offerings/order";
import { buildSendSharePermission, sendShareFormSchema } from "@clc/core/features/wallet/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { isAddress } from "viem";

import { selectedOfferingOrderLines, type OfferingOrderQuantities } from "#/components/offerings";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useCurrentMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useCurrentVoucherOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";
import {
  useCreateSendShare,
  useSendShareEligibility,
} from "#/features/wallet/hooks/use-send-share";

/**
 * Everything behind a send receipt's "Add a message or place an order": who
 * may receive a message, whether the recipient issued the voucher and sells
 * anything against it, the order picked from those offerings, and the form
 * that shares the message, the contact details and the order. The phone panel
 * and the desktop receipt render it; neither owns any of it.
 */
export function useSendShareForm({
  txHash,
  recipientAddress,
  tokenAddress,
  voucherSymbol,
}: {
  txHash: string;
  recipientAddress: string;
  tokenAddress: string | undefined;
  voucherSymbol: string;
}) {
  const { t } = useLingui();
  const eligibility = useSendShareEligibility(recipientAddress);
  const profile = useAuthProfile();
  const createShare = useCreateSendShare(txHash);
  const verifiedTokenAddress =
    tokenAddress && isAddress(tokenAddress, { strict: false }) ? tokenAddress : undefined;
  const voucher = useCurrentMarketVoucherDetail(verifiedTokenAddress);
  const voucherCheckLoading =
    verifiedTokenAddress !== undefined &&
    !voucher.isError &&
    (voucher.isPending || voucher.isFetching);
  const isVoucherOwner =
    !voucherCheckLoading &&
    !voucher.isError &&
    !!voucher.data?.ownerAddress &&
    voucher.data.ownerAddress.toLowerCase() === recipientAddress.toLowerCase();
  const offeringsQuery = useCurrentVoucherOfferingsInfinite(
    isVoucherOwner ? verifiedTokenAddress : undefined,
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = offeringsQuery;
  useEffect(() => {
    if (!isVoucherOwner || offeringsQuery.isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isVoucherOwner, offeringsQuery.isError]);
  const offerings =
    offeringsQuery.data?.pages
      .flatMap((page) => page.offerings)
      .filter((offering) => offering.available !== false) ?? [];
  const offeringsCheckLoading =
    isVoucherOwner &&
    !offeringsQuery.isError &&
    (offeringsQuery.isPending ||
      offeringsQuery.isFetching ||
      offeringsQuery.isFetchingNextPage ||
      offeringsQuery.hasNextPage === true);
  const orderCheckLoading = voucherCheckLoading || offeringsCheckLoading;
  const orderCheckError =
    verifiedTokenAddress !== undefined &&
    (voucher.isError || (isVoucherOwner && offeringsQuery.isError));
  const orderReady =
    isVoucherOwner &&
    !orderCheckLoading &&
    !orderCheckError &&
    !offeringsQuery.hasNextPage &&
    offerings.length > 0;
  const [orderQuantities, setOrderQuantities] = useState<OfferingOrderQuantities>({});
  const [orderFormError, setOrderFormError] = useState<string | null>(null);
  const orderContext = {
    voucherSymbol: voucher.data?.symbol ?? voucherSymbol,
    voucherValue: voucher.data?.voucherValue ?? null,
    voucherUoa: voucher.data?.voucherUoa ?? null,
  };
  const orderLines = selectedOfferingOrderLines(offerings, orderQuantities, orderContext);
  const orderLabels = {
    order: t`Order`,
    total: t`Order total`,
    message: t`Message`,
    priceOnRequest: t`Price on request`,
    pricedSubtotal: t`Priced subtotal`,
  };
  const hasEmail = !!profile.data?.email && !profile.data.email.endsWith("@clc.local");
  const hasPhone = !!profile.data?.phone;
  const hasLocation =
    !!profile.data?.locationName && profile.data.geoLat != null && profile.data.geoLng != null;
  const form = useForm({
    defaultValues: {
      note: "",
      email: false,
      phone: false,
      location: false,
      order: false,
    },
    validators: { onSubmit: sendShareFormSchema },
    onSubmit: async ({ value }) => {
      const orderNote = buildOfferingOrderNote({
        message: value.note,
        lines: orderLines,
        labels: orderLabels,
      });
      if (!orderNote.ok) {
        setOrderFormError(
          orderNote.reason === "too-long"
            ? t`The message and order must be 500 characters or fewer.`
            : t`Couldn't prepare this order. Please review it and try again.`,
        );
        return;
      }
      setOrderFormError(null);
      const parsed = sendShareFormSchema.parse({
        ...value,
        note: orderLines.length > 0 ? orderNote.note : value.note,
        order: orderLines.length > 0,
      });
      const permission = buildSendSharePermission(parsed);
      try {
        await createShare.mutateAsync({
          permission,
          ...(parsed.note ? { note: parsed.note } : {}),
        });
      } catch {
        return;
      }
    },
  });

  /** Picks the order lines; an order replaces any earlier "too long" error. */
  const changeOrderQuantities = (next: OfferingOrderQuantities) => {
    setOrderFormError(null);
    setOrderQuantities(next);
    form.setFieldValue("order", Object.keys(next).length > 0);
  };

  return {
    eligibility,
    voucher,
    offeringsQuery,
    offerings,
    orderCheckLoading,
    orderCheckError,
    orderReady,
    orderQuantities,
    changeOrderQuantities,
    orderFormError,
    orderContext,
    orderLines,
    orderLabels,
    hasEmail,
    hasPhone,
    hasLocation,
    form,
    createShare,
  };
}
