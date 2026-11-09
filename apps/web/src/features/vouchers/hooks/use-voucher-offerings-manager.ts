import type { Offering } from "@clc/api/features/offerings/client";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";

import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  useManagedVoucherOfferingsInfinite,
  useVoucherOfferingsInfinite,
} from "#/features/home/hooks/use-voucher-offerings";
import { useDeleteVoucherOffering } from "#/features/wallet/hooks/use-offering-mutations";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { isStorageConfigured } from "#/lib/api/storage";

/** Adding a new offering, or editing one that exists. */
export type OfferingEditor = { kind: "create" } | { kind: "edit"; offering: Offering };

/**
 * One voucher's offerings and, for its issuer, the controls to change them.
 *
 * The backend session's address decides ownership, not the wagmi connector's:
 * the write is authorized against the cookie, so a connector that has moved on
 * from the session would show controls whose requests then fail with a 403. A
 * signer of the Safe that owns the voucher may publish for it too. The owner
 * reads the managed (uncached) list so their own changes never come back stale.
 */
export function useVoucherOfferingsManager({
  voucherAddress,
  ownerAddress,
  readOnly = false,
}: {
  voucherAddress: string | undefined;
  /** The catalog's owner for this voucher, or null when it records none. */
  ownerAddress: string | null;
  readOnly?: boolean;
}) {
  const { t } = useLingui();
  const { isAuthenticated, session } = useAuthStatus();
  const profileQuery = useAuthProfile();
  const ownerInfo = useAssetOwnerInfo(voucherAddress ?? "", ownerAddress);
  const isOwner =
    !readOnly &&
    isAuthenticated &&
    Boolean(session?.address) &&
    Boolean(ownerAddress) &&
    ownerInfo.canManage;

  const usage = useResourceUsage(isOwner, voucherAddress);
  const [editor, setEditor] = useState<OfferingEditor | null>(null);
  const [deletingID, setDeletingID] = useState<string | null>(null);
  const remove = useDeleteVoucherOffering(voucherAddress ?? "");

  const visitorQuery = useVoucherOfferingsInfinite(isOwner ? undefined : voucherAddress);
  const ownerQuery = useManagedVoucherOfferingsInfinite(isOwner ? voucherAddress : undefined);
  const query = isOwner ? ownerQuery : visitorQuery;

  async function requestDelete(offering: Offering) {
    if (!window.confirm(t`Remove “${offering.name}” from the marketplace?`)) return;
    setDeletingID(offering.id);
    try {
      await remove.mutateAsync(offering.id);
      toast.success(t`Offering removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Couldn't remove the offering.`);
    } finally {
      setDeletingID(null);
    }
  }

  return {
    isOwner,
    usage,
    query,
    editor,
    setEditor,
    deletingID,
    requestDelete,
    canCreate: !!voucherAddress && !usage.isError && !!usage.data?.offers.canCreate,
    defaultImageUrl: isStorageConfigured ? (profileQuery.data?.avatarUrl ?? null) : null,
  };
}
