import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { parseWantSheetSearch } from "./want-sheet-search";
import { parseVoucherSheetSearch } from "./voucher-sheet-search";

declare module "@tanstack/react-router" {
  interface HistoryState {
    wantSheet?: true;
  }
}

export function useWantSheetSelection() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const { want = null } = parseWantSheetSearch(search);
  const { voucher = null } = parseVoucherSheetSearch(search);
  const closingRef = useRef<string | null>(null);
  useEffect(() => {
    closingRef.current = null;
  }, [want]);

  const open = useCallback(
    (id: string) => {
      if (want === id) return;
      closingRef.current = null;
      const replacingSheet = want !== null || voucher !== null;
      const currentEntryIsSheet =
        router.state.location.state.wantSheet || router.state.location.state.voucherSheet;
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          want: id,
          voucher: undefined,
          voucherTab: undefined,
        }),
        replace: replacingSheet,
        state: !replacingSheet || currentEntryIsSheet ? { wantSheet: true } : true,
        resetScroll: false,
      });
    },
    [navigate, router, voucher, want],
  );

  const close = useCallback(() => {
    if (!want || closingRef.current === want) return;
    closingRef.current = want;
    if (router.state.location.state.wantSheet) {
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, want: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate, router, want]);

  return { want, open, close } as const;
}
