import type { PoolCreateInput } from "@clc/core/features/pools/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useLingui } from "@lingui/react/macro";

import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { InfoRow } from "#/components/ui/info-row";
import { EllipsizedAddress } from "#/components/wallet";

type PoolDetails = Omit<PoolCreateInput, "location" | "acceptedTerms" | "acceptedSproutLicense"> & {
  location?: PoolCreateInput["location"];
};

export function PoolDetailsRows({
  values,
  onCopyFeeAddress,
}: {
  values: PoolDetails;
  /**
   * Makes the fee recipient copyable, the way the published screen treats the
   * contract address and the transaction hash. Omitted on the review step,
   * where nothing on chain exists yet to copy a reference to.
   */
  onCopyFeeAddress?: (value: string) => void;
}) {
  const { t } = useLingui();
  const feeAddress = values.feeAddress.trim();

  return (
    <>
      <InfoRow label={t`Pool`}>{values.name}</InfoRow>
      <InfoRow label={t`Shortcode`}>{values.symbol}</InfoRow>
      <InfoRow label={t`Unit of account`}>{values.unitOfAccount}</InfoRow>
      <InfoRow label={t`Description`}>{values.description}</InfoRow>
      <InfoRow label={t`Pricing`} muted>
        {values.pricing === "relative"
          ? t`Relative pricing`
          : values.pricing === "oracle"
            ? t`Oracle pricing`
            : t`Equal value`}
      </InfoRow>
      <InfoRow label={t`Swap fee`} muted>
        {values.feePolicyDefault}%
      </InfoRow>
      <InfoRow label={t`Fees held separately`} muted>
        {values.feesDecoupled ? t`Yes` : t`No`}
      </InfoRow>
      {Number(values.feePolicyDefault) > 0 ? (
        <InfoRow label={t`Fee recipient`} muted>
          {feeAddress === "" ? (
            t`Your wallet`
          ) : onCopyFeeAddress ? (
            <CopyableInfoValue
              value={feeAddress}
              label={t`Copy fee recipient`}
              onCopy={onCopyFeeAddress}
            />
          ) : (
            <EllipsizedAddress address={feeAddress} />
          )}
        </InfoRow>
      ) : null}
      <InfoRow label={t`Decimals`} muted>
        6
      </InfoRow>
      <InfoRow label={t`Location`}>{values.location?.locationName ?? "—"}</InfoRow>
      <InfoRow label={t`Tags`} muted>
        {values.tags.join(", ") || "—"}
      </InfoRow>
      <InfoRow label={t`Email`} muted>
        {values.email || "—"}
      </InfoRow>
      <InfoRow label={t`Website`} muted>
        {values.website || "—"}
      </InfoRow>
      <InfoRow label={t`Phone`} muted>
        {values.phone || "—"}
      </InfoRow>
      <InfoRow label={t`Terms`} muted>
        {values.terms === "" ? "—" : isHttpUrl(values.terms) ? values.terms : t`Written below`}
      </InfoRow>
    </>
  );
}
