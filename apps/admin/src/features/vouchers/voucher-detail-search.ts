export const VOUCHER_DETAIL_TABS = ["offerings", "transactions", "reports", "pools"] as const;

export type VoucherDetailTab = (typeof VOUCHER_DETAIL_TABS)[number];

export type VoucherDetailSearch = {
  tab: VoucherDetailTab;
};

export function parseVoucherDetailSearch(search: Record<string, unknown>): VoucherDetailSearch {
  const tab = VOUCHER_DETAIL_TABS.find((candidate) => candidate === search.tab);
  return { tab: tab ?? "offerings" };
}
