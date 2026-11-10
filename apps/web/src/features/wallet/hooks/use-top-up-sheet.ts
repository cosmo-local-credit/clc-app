import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import type { TopUpSearch } from "#/features/wallet/top-up-search";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Opening an Add / withdraw form pushed this entry, so closing it pops it. */
    topUpSheet?: true;
  }
}

/**
 * What Add / withdraw has open, kept in the URL so both views show the same
 * thing across a layout switch and Back closes it in either.
 *
 * Opening the first form pushes an entry; switching to another replaces it and
 * keeps the mark. Closing pops only an entry an open pushed, which the mark in
 * history state records whichever view pushed it. A direct link pushed nothing,
 * so closing it replaces the URL with the page itself rather than leaving.
 *
 * A view that is gone does not close anything: a submit that settles after a
 * layout switch must not shut the form the other view now shows.
 */
export function useTopUpSheet() {
  const search = useSearch({ from: "/_nav/wallet/top-up" });
  const navigate = useNavigate();
  const router = useRouter();
  const isOpen = search.sheet !== undefined || search.tx !== undefined;
  const mounted = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    closing.current = false;
  }, [search.sheet, search.tx]);

  function open(next: TopUpSearch) {
    if (next.sheet === search.sheet && next.tx === search.tx) return;
    void navigate({
      to: "/wallet/top-up",
      search: next,
      replace: isOpen,
      state: isOpen ? true : { topUpSheet: true },
      resetScroll: false,
    });
  }

  function close() {
    if (!mounted.current || !isOpen || closing.current) return;
    closing.current = true;
    if (router.state.location.state.topUpSheet) {
      router.history.back();
      return;
    }
    void navigate({ to: "/wallet/top-up", search: {}, replace: true, resetScroll: false });
  }

  return {
    /** The open ramp form; a history row takes precedence over it. */
    sheet: search.tx ? undefined : search.sheet,
    tx: search.tx,
    open,
    close,
  };
}
