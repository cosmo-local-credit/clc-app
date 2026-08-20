import type { PoolCreateInput } from "@clc/core/features/pools/logic";
import { useLingui } from "@lingui/react/macro";

import { InfoRow } from "#/components/ui/info-row";

type PoolDetails = Omit<PoolCreateInput, "location" | "acceptedTerms" | "acceptedSproutLicense"> & {
  location?: PoolCreateInput["location"];
};

export function PoolDetailsRows({ values }: { values: PoolDetails }) {
  const { t } = useLingui();

  return (
    <>
      <InfoRow label={t`Pool`}>{values.name}</InfoRow>
      <InfoRow label={t`Shortcode`}>{values.symbol}</InfoRow>
      <InfoRow label={t`Unit`}>{values.unit}</InfoRow>
      <InfoRow label={t`Description`}>{values.description}</InfoRow>
      <InfoRow label={t`Pricing`} muted>
        {values.pricing === "oracle" ? t`Price feed` : t`Equal value`}
      </InfoRow>
      <InfoRow label={t`Swap fee`} muted>
        {values.feePolicyDefault}%
      </InfoRow>
      <InfoRow label={t`Fees held separately`} muted>
        {values.feesDecoupled ? t`Yes` : t`No`}
      </InfoRow>
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
        {values.terms || "—"}
      </InfoRow>
    </>
  );
}
