import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { parseVoucherSheetSearch } from "#/lib/navigation/voucher-sheet-search";
import { parseWantSheetSearch } from "#/lib/navigation/want-sheet-search";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /**
     * On the entry a tap on a voucher pushed. Only that entry may be popped to
     * close its card: an entry behind a deep link can be anything, another tab
     * included.
     */
    voucherSheet?: true;
  }
}

export type VoucherSheetSelection = {
  /** The voucher whose card is open, as the URL spells it. */
  voucher: `0x${string}` | null;
  open: (address: `0x${string}`) => void;
  close: () => void;
};

/**
 * The map voucher card's selection, kept in the map URL so Back, a refresh and
 * a shared link all keep it. Non-map voucher links use the canonical voucher
 * page instead.
 *
 * Each opened card costs one history entry: the first tap pushes it and marks
 * it, another voucher while a card is open replaces it and keeps the mark, and
 * closing pops it again. A card reached any other way, a deep link above all,
 * closes by replacing, so Close never leaves the screen.
 *
 * Anything that replaces the entry while its card stays open must pass
 * `state: true`, or the mark is lost and Close stops popping.
 */
export function useVoucherSheetSelection(): VoucherSheetSelection {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const { voucher = null } = parseVoucherSheetSearch(search);
  const { want = null } = parseWantSheetSearch(search);

  // Closing by Back is asynchronous. A swipe and a tap landing together must
  // not pop two entries.
  const closingRef = useRef<string | null>(null);
  useEffect(() => {
    closingRef.current = null;
  }, [voucher]);

  const open = useCallback(
    (address: `0x${string}`) => {
      if (voucher?.toLowerCase() === address.toLowerCase()) return;
      closingRef.current = null;
      const replacingSheet = voucher !== null || want !== null;
      const currentEntryIsSheet =
        router.state.location.state.voucherSheet || router.state.location.state.wantSheet;
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          voucher: address,
          voucherTab: undefined,
          want: undefined,
        }),
        replace: replacingSheet,
        state: !replacingSheet || currentEntryIsSheet ? { voucherSheet: true } : true,
        resetScroll: false,
      });
    },
    [navigate, router, voucher, want],
  );

  const close = useCallback(() => {
    if (!voucher || closingRef.current === voucher) return;
    closingRef.current = voucher;
    if (router.state.location.state.voucherSheet) {
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, voucher: undefined, voucherTab: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate, router, voucher]);

  return { voucher, open, close };
}
