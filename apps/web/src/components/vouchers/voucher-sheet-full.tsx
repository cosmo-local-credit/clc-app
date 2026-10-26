import type { MarketVoucherDetail } from "@clc/api/features/market/client";

import { VoucherDetailSections } from "./voucher-detail-sections";

/**
 * The complete voucher page content, split into its own chunk so a peek-only
 * map sheet does not load posts, activity, editors, and maps until requested.
 */
export function VoucherSheetFull({
  address,
  detail,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
}) {
  return (
    <VoucherDetailSections
      className="px-4 pt-2"
      address={detail?.address ?? address}
      detail={detail}
      symbol={detail?.symbol ?? ""}
      name={detail?.name ?? ""}
      decimals={detail?.decimals ?? undefined}
      ownerAddress={detail?.ownerAddress ?? null}
      chainId={detail?.chainId ?? null}
      voucherValue={detail?.voucherValue ?? null}
      voucherUoa={detail?.voucherUoa ?? null}
      description={detail?.description ?? null}
      email={detail?.email ?? null}
      website={detail?.website ?? null}
      phone={detail?.phone ?? null}
      terms={detail?.terms ?? null}
      locationName={detail?.locationName ?? null}
      lat={detail?.lat ?? null}
      lng={detail?.lng ?? null}
      dataPending={!detail}
      headingLevel={3}
      idPrefix="voucher-sheet"
    />
  );
}
