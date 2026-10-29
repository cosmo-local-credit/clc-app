import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { marketViewOf } from "#/desktop/chrome";
import { usePaletteStore } from "#/desktop/palette-store";
import { useShortcutHelp } from "#/desktop/shell/shortcut-help";
import { useCharacterShortcuts } from "#/desktop/shell/shortcut-state";
import { useSidebarCollapsed } from "#/desktop/sidebar-state";

/** What the person is typing into. Letters belong to it, not to the shell. */
const FORM_CONTROL =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]';

/**
 * A layer that takes the keyboard while it is open: a dialog or popover (Base
 * UI's popover is a `dialog`), a menu, a listbox. The inspector is a layer too
 * once focus is inside it; docked beside a list it is not, so J and K keep
 * walking the list.
 */
const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
const OPEN_POPUP = '[aria-haspopup][aria-expanded="true"]';
const INSPECTOR = "[data-desk-inspector]";

/** One list's rows share the nearest of these, or else their parent. */
const ROW_LIST =
  '[role="table"], [role="grid"], [role="list"], [role="listbox"], [data-desktop-list], table, ul, ol';

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

function isFormControl(target: EventTarget | null) {
  return target instanceof Element && target.closest(FORM_CONTROL) !== null;
}

/** A dialog, popover, menu or listbox is open, wherever focus is. The docked inspector is not one. */
function layerOpen() {
  return (
    document.querySelector(`${LAYER}:not(${INSPECTOR})`) !== null ||
    document.querySelector(OPEN_POPUP) !== null
  );
}

/** The inspector, dialog, menu or popover the key was pressed inside. */
function insideLayer(target: EventTarget | null) {
  return target instanceof Element && target.closest(`${LAYER}, ${INSPECTOR}`) !== null;
}

function listOf(row: HTMLElement): Element {
  return row.closest(ROW_LIST) ?? row.parentElement ?? document.body;
}

/**
 * The rows J and K walk: those of one list that can be reached now. Anything
 * inside `[inert]` (the pane behind an overlaid inspector) is skipped, and the
 * list that holds focus wins over the first one on the page.
 */
function activeRows() {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-desktop-row]")].filter(
    (row) => row.closest('[inert], [hidden], [aria-hidden="true"]') === null,
  );
  const first = rows[0];
  if (!first) return rows;
  const focus = document.activeElement;
  const lists = [...new Set(rows.map(listOf))];
  const list = (focus && lists.find((entry) => entry.contains(focus))) ?? listOf(first);
  return rows.filter((row) => listOf(row) === list);
}

function searchFields(value: unknown) {
  if (typeof value !== "object" || value === null) return {};
  return value as { voucher?: unknown; want?: unknown; tx?: unknown };
}

/**
 * The desktop's keyboard. Ctrl/⌘ K and Escape are always on; the character
 * keys (`/`, `[`, `?`, J, K, G then M, W or A) can be switched off and yield
 * to any dialog, popover, menu, inspector or form control that has the
 * keyboard. Each one accelerates something already visible: a payment action
 * never has a single key.
 *
 * The listener runs in the bubble phase, so a component or a Base UI popup that
 * handled the key first (and said so) is never second-guessed.
 *
 * `sidebarToggle` is false where the sidebar has no visible collapse control
 * (the map forces the rail), so `[` does nothing there.
 */
export function DesktopShortcuts({ sidebarToggle = true }: { sidebarToggle?: boolean }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { toggle } = useSidebarCollapsed();
  const { enabled } = useCharacterShortcuts();
  const setPaletteOpen = usePaletteStore((state) => state.setOpen);
  const setHelpOpen = useShortcutHelp((state) => state.setOpen);
  const chord = useRef<number | null>(null);
  const latest = useRef({ enabled, sidebarToggle, toggle });
  useEffect(() => {
    latest.current = { enabled, sidebarToggle, toggle };
  });

  useEffect(() => {
    function clearChord() {
      if (chord.current) window.clearTimeout(chord.current);
      chord.current = null;
    }

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const key = event.key;
      const state = latest.current;

      // Ctrl/⌘ K reaches the palette from anywhere, form fields included, but not over another layer.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key.toLowerCase() === "k") {
        if (layerOpen()) return;
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (isFormControl(event.target)) return;

      if (key === "Escape") {
        // The topmost layer closes, and only it. An open popup, menu or dialog
        // closes itself; this runs only once none is left.
        if (layerOpen()) return;
        const inside = event.target instanceof Element && event.target.closest(INSPECTOR);
        const inspector = [...document.querySelectorAll<HTMLElement>(INSPECTOR)]
          .filter((entry) => entry.closest("[inert]") === null)
          .at(-1);
        if (inspector && !inside) {
          // The inspector's own Escape handling runs the page's close.
          event.preventDefault();
          inspector.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
          return;
        }
        const fields = searchFields(router.state.location.search);
        if (fields.voucher || fields.want || fields.tx) {
          event.preventDefault();
          router.history.back();
        }
        return;
      }

      if (MODIFIER_KEYS.has(key)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!state.enabled || layerOpen() || insideLayer(event.target)) {
        clearChord();
        return;
      }

      const lower = key.toLowerCase();
      if (key === "/") {
        const field = [...document.querySelectorAll<HTMLElement>("[data-desktop-search]")].find(
          (entry) => entry.closest("[inert]") === null,
        );
        if (!field) return;
        event.preventDefault();
        field.focus();
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (key === "[") {
        if (!state.sidebarToggle) return;
        event.preventDefault();
        state.toggle();
        return;
      }
      if ((lower === "j" || lower === "k") && !event.shiftKey) {
        const rows = activeRows();
        if (rows.length === 0) return;
        event.preventDefault();
        const current = document.activeElement;
        const index = rows.findIndex(
          (row) => row === current || (current instanceof Node && row.contains(current)),
        );
        const direction = lower === "j" ? 1 : -1;
        const next =
          index < 0
            ? direction > 0
              ? 0
              : rows.length - 1
            : Math.min(rows.length - 1, Math.max(0, index + direction));
        rows[next]?.focus();
        return;
      }
      if (lower === "g" && !event.shiftKey) {
        clearChord();
        chord.current = window.setTimeout(() => {
          chord.current = null;
        }, 800);
        return;
      }
      const pending = chord.current !== null;
      clearChord();
      if (pending && (lower === "m" || lower === "w" || lower === "a")) {
        event.preventDefault();
        if (lower === "m") {
          // The map, or the list of everything when the list is the view in use.
          const view = marketViewOf(router.state.location.search);
          if (view === "list") {
            void navigate({ to: "/market", search: { scope: "all", view: "list" } });
          } else {
            void navigate({ to: "/", search: { tab: "market", ...(view ? { view } : {}) } });
          }
        } else if (lower === "w") {
          void navigate({ to: "/", search: { tab: "wallet" } });
        } else {
          void navigate({ to: "/", search: { tab: "activity" } });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearChord();
    };
  }, [navigate, router, setHelpOpen, setPaletteOpen]);

  return null;
}
