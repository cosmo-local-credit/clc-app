import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

declare module "@tanstack/react-router" {
  interface HistoryState {
    catalogEditor?: true;
  }
}

export type CatalogEditor = { editing: boolean; open: () => void; close: () => void };

/** Both layouts use the same URL entry; only an editor we opened may pop it. */
export function useCatalogEditor(): CatalogEditor {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { edit?: unknown };
  const editing = search.edit === true;
  const closing = useRef(false);
  useEffect(() => {
    closing.current = false;
  }, [editing]);

  function open() {
    if (editing) return;
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, edit: true }),
      state: { catalogEditor: true },
      resetScroll: false,
    });
  }

  function close() {
    if (!editing || closing.current) return;
    closing.current = true;
    if (router.state.location.state.catalogEditor) {
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, edit: undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  return { editing, open, close };
}
