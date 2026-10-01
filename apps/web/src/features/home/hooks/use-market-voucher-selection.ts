import { useCanGoBack, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { type HomeRouteSearch, parseHomeSearch } from "#/lib/navigation/home-tabs";

export type MarketVoucherSelection = {
  /** The voucher whose card is open, as the URL spells it. */
  voucher: `0x${string}` | null;
  voucherTab: NonNullable<HomeRouteSearch["voucherTab"]> | undefined;
  select: (address: `0x${string}`) => void;
  close: () => void;
};

/**
 * The market card's selection, kept in the URL so Back, a refresh and a shared
 * link all keep it.
 *
 * Each opened card costs one history entry: the first pin pushes, another pin
 * while a card is open replaces, and closing pops it again. A card reached by a
 * deep link has nothing in this app to pop back to, so it closes by replacing,
 * and Close never takes the viewer out of the app.
 */
export function useMarketVoucherSelection(): MarketVoucherSelection {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { voucher = null, voucherTab } = parseHomeSearch(search);

  // Closing by Back is asynchronous. A swipe and a map tap landing together
  // must not pop two entries.
  const closingRef = useRef<string | null>(null);
  useEffect(() => {
    closingRef.current = null;
  }, [voucher]);

  const select = useCallback(
    (address: `0x${string}`) => {
      if (voucher?.toLowerCase() === address.toLowerCase()) return;
      closingRef.current = null;
      void navigate({
        to: "/",
        search: (previous) => ({
          ...previous,
          tab: "market",
          view: "map",
          voucher: address,
          voucherTab: undefined,
        }),
        replace: voucher !== null,
        resetScroll: false,
      });
    },
    [navigate, voucher],
  );

  const close = useCallback(() => {
    if (!voucher || closingRef.current === voucher) return;
    closingRef.current = voucher;
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({
      to: "/",
      search: (previous) => ({
        ...previous,
        tab: "market",
        voucher: undefined,
        voucherTab: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [canGoBack, navigate, router, voucher]);

  return { voucher, voucherTab, select, close };
}
