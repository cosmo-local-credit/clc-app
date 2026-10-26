import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { usePaletteStore } from "#/desktop/palette-store";
import { useSidebarCollapsed } from "#/desktop/sidebar-state";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.getAttribute("role") === "textbox";
}

function searchFields(value: unknown) {
  if (typeof value !== "object" || value === null) return {};
  return value as { voucher?: unknown; want?: unknown; tx?: unknown };
}

export function DesktopShortcuts() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useRouterState({ select: (state) => state.location.search });
  const { toggle } = useSidebarCollapsed();
  const setOpen = usePaletteStore((state) => state.setOpen);
  const chord = useRef<number | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const key = event.key;
      const paletteOpen = usePaletteStore.getState().open;
      if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (key === "Escape" && paletteOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (key === "/") {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-desktop-search]")?.focus();
        return;
      }
      if (key === "[") {
        event.preventDefault();
        toggle();
        return;
      }
      if (key === "Escape") {
        const fields = searchFields(search);
        if (fields.voucher || fields.want || fields.tx) {
          event.preventDefault();
          router.history.back();
        }
        return;
      }
      if ((key === "j" || key === "k") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-desktop-row]")];
        if (rows.length === 0) return;
        event.preventDefault();
        const current = document.activeElement;
        const index = rows.findIndex(
          (row) => row === current || (current instanceof Node && row.contains(current)),
        );
        const direction = key === "j" ? 1 : -1;
        const next =
          index < 0
            ? direction > 0
              ? 0
              : rows.length - 1
            : Math.min(rows.length - 1, Math.max(0, index + direction));
        rows[next]?.focus();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const lower = key.toLowerCase();
      if (lower === "g") {
        if (chord.current) window.clearTimeout(chord.current);
        chord.current = window.setTimeout(() => {
          chord.current = null;
        }, 800);
        return;
      }
      if (chord.current && (lower === "m" || lower === "w" || lower === "a")) {
        window.clearTimeout(chord.current);
        chord.current = null;
        event.preventDefault();
        if (lower === "m") {
          void navigate({ to: "/", search: { tab: "market", view: "map" } });
        } else if (lower === "w") {
          void navigate({ to: "/", search: { tab: "wallet" } });
        } else {
          void navigate({ to: "/", search: { tab: "activity" } });
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (chord.current) window.clearTimeout(chord.current);
    };
  }, [navigate, router, search, setOpen, toggle]);

  return null;
}
