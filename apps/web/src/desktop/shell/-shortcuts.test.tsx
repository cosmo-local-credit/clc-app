import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { usePaletteStore } from "#/desktop/palette-store";
import { DeskInspector } from "#/desktop/ui/inspector";

import { renderInShell } from "./-shell-test-router";
import { ShortcutHelp, useShortcutHelp } from "./shortcut-help";
import { DesktopShortcuts } from "./shortcuts";

const SIDEBAR_KEY = "clc.desktop.sidebar";
const SHORTCUTS_KEY = "clc.desktop.shortcuts";

beforeEach(() => {
  window.localStorage.removeItem(SIDEBAR_KEY);
  window.localStorage.removeItem(SHORTCUTS_KEY);
  usePaletteStore.setState({ open: false });
  useShortcutHelp.setState({ open: false });
});

/** A key pressed on `target`. False means something called preventDefault, so a shortcut ran. */
function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  return !fireEvent.keyDown(target, { key, ...init });
}

function Rows({ name, label }: { name: string; label: string }) {
  return (
    <ul aria-label={name}>
      {[1, 2, 3].map((n) => (
        <li key={n}>
          <button type="button" data-desktop-row="">
            {label}
            {n}
          </button>
        </li>
      ))}
    </ul>
  );
}

const row = (name: string) => screen.getByRole("button", { name });

describe("J and K", () => {
  it("walk one list and stop at its ends", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
      </>,
    );
    expect(press(document.body, "j")).toBe(true);
    expect(document.activeElement).toBe(row("Row 1"));
    press(row("Row 1"), "j");
    expect(document.activeElement).toBe(row("Row 2"));
    press(row("Row 2"), "j");
    press(row("Row 3"), "j");
    expect(document.activeElement).toBe(row("Row 3"));
    press(row("Row 3"), "k");
    expect(document.activeElement).toBe(row("Row 2"));
  });

  it("skip rows inside inert content and use the list that can be reached", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <div inert>
          <Rows name="Behind" label="Hidden " />
        </div>
        <Rows name="Active" label="Live " />
      </>,
    );
    press(document.body, "j");
    expect(document.activeElement).toBe(row("Live 1"));
    (document.activeElement as HTMLElement).blur();
    press(document.body, "k");
    expect(document.activeElement).toBe(row("Live 3"));
  });

  it("prefer the list that holds focus over the first one on the page", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="First" label="A" />
        <Rows name="Second" label="B" />
      </>,
    );
    row("B2").focus();
    press(row("B2"), "j");
    expect(document.activeElement).toBe(row("B3"));
    press(row("B3"), "k");
    press(row("B2"), "k");
    expect(document.activeElement).toBe(row("B1"));
    // The first list is never entered from the second.
    press(row("B1"), "k");
    expect(document.activeElement).toBe(row("B1"));
  });

  it("keep walking the list beside a docked inspector, but not from inside it", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
        <DeskInspector title="Details" onClose={() => undefined}>
          <button type="button">Inside</button>
        </DeskInspector>
      </>,
    );
    row("Row 1").focus();
    expect(press(row("Row 1"), "j")).toBe(true);
    expect(document.activeElement).toBe(row("Row 2"));

    const inside = row("Inside");
    inside.focus();
    expect(press(inside, "j")).toBe(false);
    expect(document.activeElement).toBe(inside);
  });
});

describe("shortcuts yield to whatever has the keyboard", () => {
  it.each([
    ["a text field", <input key="i" aria-label="Note" />, "Note"],
    ["a textarea", <textarea key="t" aria-label="Note" />, "Note"],
    ["a select", <select key="s" aria-label="Note" />, "Note"],
  ])("does not take letters from %s", async (_name, field, label) => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
        {field}
      </>,
    );
    const control = screen.getByLabelText(label);
    control.focus();
    for (const key of ["j", "k", "/", "[", "?", "g"]) {
      expect(press(control, key)).toBe(false);
    }
    expect(document.activeElement).toBe(control);
  });

  it("does not take letters while a dialog is open", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
        <div role="dialog" aria-label="Confirm">
          <button type="button">Cancel</button>
        </div>
      </>,
    );
    expect(press(row("Cancel"), "j")).toBe(false);
    expect(press(document.body, "j")).toBe(false);
    expect(document.activeElement).not.toBe(row("Row 1"));
  });

  it("does not take letters while a popover is open, wherever focus is", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
        <PopoverRoot>
          <PopoverTrigger>Menu</PopoverTrigger>
          <PopoverContent>
            <button type="button">Choice</button>
          </PopoverContent>
        </PopoverRoot>
      </>,
    );
    expect(press(document.body, "j")).toBe(true);
    row("Row 1").blur();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("dialog");
    expect(press(document.body, "j")).toBe(false);
    expect(document.activeElement).not.toBe(row("Row 1"));
  });

  it("keeps Ctrl+K working from a text field, but not over another dialog", async () => {
    const { unmount } = await renderInShell(
      <>
        <DesktopShortcuts />
        <input aria-label="Note" />
      </>,
    );
    expect(press(screen.getByLabelText("Note"), "k", { ctrlKey: true })).toBe(true);
    expect(usePaletteStore.getState().open).toBe(true);
    unmount();

    usePaletteStore.setState({ open: false });
    await renderInShell(
      <>
        <DesktopShortcuts />
        <div role="dialog" aria-label="Confirm" />
      </>,
    );
    expect(press(document.body, "k", { metaKey: true })).toBe(false);
    expect(usePaletteStore.getState().open).toBe(false);
  });
});

describe("the single-key shortcuts", () => {
  it("can be switched off from the shortcut list, and stay off", async () => {
    await renderInShell(
      <>
        <DesktopShortcuts />
        <ShortcutHelp />
        <Rows name="Results" label="Row " />
      </>,
    );
    expect(press(document.body, "?")).toBe(true);
    const toggle = await screen.findByRole("switch", { name: "Single-key shortcuts" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBe("off");
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    for (const key of ["j", "/", "[", "?"]) {
      expect(press(document.body, key)).toBe(false);
    }
    expect(document.activeElement).not.toBe(row("Row 1"));
    expect(useShortcutHelp.getState().open).toBe(false);
    // Ctrl+K is not a character key.
    expect(press(document.body, "k", { ctrlKey: true })).toBe(true);
    expect(usePaletteStore.getState().open).toBe(true);
  });

  it("start off when the person turned them off in an earlier visit", async () => {
    window.localStorage.setItem(SHORTCUTS_KEY, "off");
    await renderInShell(
      <>
        <DesktopShortcuts />
        <Rows name="Results" label="Row " />
      </>,
    );
    expect(press(document.body, "j")).toBe(false);
  });

  it("toggle the sidebar with [ only where the sidebar shows a control for it", async () => {
    const { unmount } = await renderInShell(<DesktopShortcuts />);
    expect(press(document.body, "[")).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe("collapsed");
    unmount();

    window.localStorage.removeItem(SIDEBAR_KEY);
    await renderInShell(<DesktopShortcuts sidebarToggle={false} />);
    expect(press(document.body, "[")).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBeNull();
  });

  it("focus the search field only when one can be reached", async () => {
    const { unmount } = await renderInShell(<DesktopShortcuts />);
    expect(press(document.body, "/")).toBe(false);
    unmount();

    await renderInShell(
      <>
        <DesktopShortcuts />
        <input aria-label="Search" data-desktop-search="" />
      </>,
    );
    expect(press(document.body, "/")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Search"));
  });

  it("go to a destination with G then a letter, keeping the list view, and drop a stray chord", async () => {
    const { router } = await renderInShell(<DesktopShortcuts />, "/market?scope=offers&view=list");
    press(document.body, "g");
    press(document.body, "m");
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ scope: "all", view: "list" });
    });

    press(document.body, "g");
    press(document.body, "w");
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tab: "wallet" });
    });

    // Another key between G and the letter cancels the chord.
    press(document.body, "g");
    press(document.body, "x");
    expect(press(document.body, "a")).toBe(false);

    press(document.body, "g");
    press(document.body, "m");
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tab: "market" });
    });
    expect("view" in router.state.location.search).toBe(false);
  });
});

describe("Escape closes one layer at a time", () => {
  function Layers({ onClose }: { onClose: () => void }) {
    return (
      <>
        <DesktopShortcuts />
        <button type="button">Page</button>
        <PopoverRoot>
          <PopoverTrigger>Menu</PopoverTrigger>
          <PopoverContent>
            <button type="button">Choice</button>
          </PopoverContent>
        </PopoverRoot>
        <DeskInspector title="Details" onClose={onClose}>
          <button type="button">Inside</button>
        </DeskInspector>
      </>
    );
  }

  it("closes an open popup first, then the inspector, never both from one press", async () => {
    const onClose = vi.fn();
    await renderInShell(<Layers onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const choice = await screen.findByRole("button", { name: "Choice" });
    choice.focus();
    fireEvent.keyDown(choice, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Choice" })).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "Page" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to an open popup even when focus has not entered it", async () => {
    const onClose = vi.fn();
    await renderInShell(<Layers onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("dialog");

    // The inspector stays: a popup that is open owns the key.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not act on a key something else already handled", async () => {
    const onClose = vi.fn();
    await renderInShell(
      <div
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault();
        }}
      >
        <Layers onClose={onClose} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Page" }), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to leaving the voucher, want or transfer the URL names", async () => {
    const { router } = await renderInShell(<DesktopShortcuts />, "/?tab=market&view=map");
    await router.navigate({ to: "/", search: { tab: "market", view: "map", voucher: "0xabc" } });
    expect(router.state.location.search).toMatchObject({ voucher: "0xabc" });

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(router.state.location.search.voucher).toBeUndefined();
    });
  });

  it("does nothing when there is nothing to close", async () => {
    await renderInShell(<DesktopShortcuts />);
    expect(press(document.body, "Escape")).toBe(false);
  });
});
