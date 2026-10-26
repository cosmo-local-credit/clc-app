import type { MarketVoucherDetail } from "@clc/api/features/market/client";

import { VoucherDetailSections } from "./voucher-detail-sections";

/**
 * The complete voucher page content, split into its own chunk so a peek-only
 * map sheet does not load posts, activity, editors, and maps until requested.
 */
export function VoucherSheetFull({
  address,
  detail,
  privateInfo,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
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
      dataPending={!detail}
      privateInfo={privateInfo}
      headingLevel={3}
      idPrefix="voucher-sheet"
    />
  );
}
