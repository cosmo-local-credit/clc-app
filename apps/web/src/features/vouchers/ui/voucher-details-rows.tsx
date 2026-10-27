import { resolveMarkerStyle } from "@clc/core/features/markers/logic";
import type { VoucherCreateInput } from "@clc/core/features/vouchers/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { useLingui } from "@lingui/react/macro";

import { InfoRow } from "#/components/ui/info-row";
import { MarkerPin } from "#/components/vouchers/marker-style-picker";
import { useMarkerLabels } from "#/components/vouchers/voucher-labels";

type VoucherDetails = Omit<VoucherCreateInput, "location" | "acceptedTerms"> & {
  location?: VoucherCreateInput["location"];
};

export function VoucherDetailsRows({ values }: { values: VoucherDetails }) {
  const { t } = useLingui();
  const markerLabels = useMarkerLabels();
  // A new voucher has no offerings yet, so its automatic pin is the voucher's.
  const pin = resolveMarkerStyle({
    kind: "voucher",
    markerIcon: values.markerIcon,
    markerColor: values.markerColor,
  });
  const pinIcon = markerLabels.icon(pin.icon);

  return (
    <>
      <InfoRow label={t`Name`}>{values.name}</InfoRow>
      <InfoRow label={t`Symbol`}>{values.symbol}</InfoRow>
      <InfoRow label={t`Price`}>
        {values.price} {values.unitOfAccount}
      </InfoRow>
      <InfoRow label={t`Supply`}>
        {values.supply} {values.symbol}
      </InfoRow>
      <InfoRow label={t`Type`} muted>
        {values.voucherType === "expiring" ? t`Expiring` : t`Standard`}
      </InfoRow>
      {values.voucherType === "expiring" ? (
        <InfoRow label={t`Expiration`}>{values.expiryDate}</InfoRow>
      ) : null}
      <InfoRow label={t`Decimals`} muted>
        {values.decimals}
      </InfoRow>
      <InfoRow label={t`Description`}>{values.description}</InfoRow>
      <InfoRow label={t`Location`}>{values.location?.locationName ?? "—"}</InfoRow>
      <InfoRow label={t`Map pin`}>
        <span className="flex items-center gap-2">
          {values.markerIcon === null ? t`Default` : pinIcon}
          <MarkerPin style={pin} size={20} />
        </span>
      </InfoRow>
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
