import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeskInspector, DeskSplit } from "./inspector";

function setFrameWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
}

afterEach(() => {
  vi.restoreAllMocks();
});

function Page({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DeskSplit
      main={
        <button type="button" onClick={() => setOpen(true)}>
          Open row
        </button>
      }
      onDismiss={() => setOpen(false)}
      side={
        open ? (
          <DeskInspector
            title="Details"
            onClose={() => {
              onClose?.();
              setOpen(false);
            }}
          >
            <input aria-label="Note" />
          </DeskInspector>
        ) : null
      }
    />
  );
}

describe("DeskSplit", () => {
  it("keeps entered values and the focused node when changing between docked and modal", async () => {
    let width = 1200;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    let resize = () => {};
    vi.spyOn(globalThis, "ResizeObserver").mockImplementation(function (callback) {
      const observer: ResizeObserver = {
        observe(element) {
          if (element.firstElementChild?.classList.contains("@container")) {
            resize = () => callback([], observer);
          }
        },
        unobserve() {},
        disconnect() {},
      };
      return observer;
    });
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open row" });
    opener.focus();
    fireEvent.click(opener);
    const input = screen.getByRole("textbox", { name: "Note" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    input.focus();

    act(() => {
      width = 800;
      resize();
    });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Details" })).toBeTruthy());
    expect(screen.getByRole("textbox", { name: "Note" })).toBe(input);
    expect(input.value).toBe("Keep this draft");
    expect(document.activeElement).toBe(input);

    act(() => {
      width = 1200;
      resize();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Note" })).toBe(input);
    expect(input.value).toBe("Keep this draft");
    expect(document.activeElement).toBe(input);

    act(() => {
      width = 800;
      resize();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets nested dialogs and popovers claim Escape before the inspector", async () => {
    setFrameWidth(800);
    const dismiss = vi.fn();
    render(
      <DeskSplit
        onDismiss={dismiss}
        main={<button type="button">Results</button>}
        side={
          <DeskInspector title="Details" onClose={dismiss}>
            <Dialog.Root>
              <Dialog.Trigger>Open confirmation</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Popup>
                  <Dialog.Title>Confirmation</Dialog.Title>
                  <input aria-label="Confirm note" />
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
            <Popover.Root>
              <Popover.Trigger>Open options</Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner>
                  <Popover.Popup>
                    <input aria-label="Option" />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </DeskInspector>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Confirmation" })).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Confirm note" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmation" })).toBeNull());
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open options" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Option" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Option" })).toBeNull());
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Details" }), { key: "Escape" });
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("owns modality for a raw side panel as well as a DeskInspector", async () => {
    setFrameWidth(800);
    render(
      <>
        <button type="button">Shell navigation</button>
        <DeskSplit
          main={<button type="button">Results row</button>}
          side={
            <aside>
              <button type="button">Back to results</button>
            </aside>
          }
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    // The same modal owner hides the surrounding shell, not just the results pane.
    expect(screen.queryByRole("button", { name: "Shell navigation" })).toBeNull();
    expect(screen.getByText("Shell navigation").getAttribute("aria-hidden")).toBe("true");
  });

  it("contains keyboard traversal at the panel edges", async () => {
    setFrameWidth(800);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open row" }));
    const dialog = screen.getByRole("dialog", { name: "Details" });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    const guards = dialog.parentElement?.querySelectorAll<HTMLElement>(
      '[data-base-ui-focus-guard][data-type="inside"]',
    );
    expect(guards).toHaveLength(2);
    // Reaching either guard, as Tab/Shift+Tab do in the browser, wraps to the other edge.
    act(() => guards?.[1]?.focus());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" })),
    );
    act(() => guards?.[0]?.focus());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Note" })),
    );
  });

  it("docks the inspector beside a pane that keeps its room", () => {
    setFrameWidth(1100);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open row" }));

    expect(screen.getByRole("complementary", { name: "Details" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The pane stays usable for browsing and comparing.
    expect(screen.getByRole("button", { name: "Open row" }).closest("[inert]")).toBeNull();
  });

  it("overlays a dialog and makes the pane inert when docking would crush it", () => {
    setFrameWidth(800);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open row" }));

    expect(screen.getByRole("dialog", { name: "Details" })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open row", hidden: true }).closest("[inert]"),
    ).not.toBeNull();
  });

  it("closes an overlaid inspector from the scrim", () => {
    setFrameWidth(800);
    const { container } = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open row" }));
    const scrim = container.querySelector('[aria-hidden="true"].absolute') as HTMLElement;
    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not treat an unmeasured pane as narrow", () => {
    setFrameWidth(0);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open row" }));
    expect(screen.getByRole("complementary", { name: "Details" })).toBeTruthy();
  });

  it("keeps the pane inert and dimmed for a modal side even when docked", () => {
    setFrameWidth(1400);
    render(
      <DeskSplit
        dimmed
        main={<button type="button">Behind</button>}
        side={<DeskInspector title="Review">body</DeskInspector>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Behind", hidden: true }).closest("[inert]"),
    ).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Review" }).getAttribute("aria-modal")).toBe("true");
  });
});

describe("DeskInspector", () => {
  it("moves focus in on open and returns it to the opener on close when overlaid", async () => {
    setFrameWidth(800);
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open row" });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Details" })),
    );

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves focus alone while docked, so row traversal keeps working", () => {
    setFrameWidth(1200);
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open row" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape unless something inside already claimed the key", () => {
    const onClose = vi.fn();
    render(
      <DeskInspector title="Details" onClose={onClose}>
        <input aria-label="Note" />
        <input
          aria-label="Menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") event.preventDefault();
          }}
        />
      </DeskInspector>,
    );

    fireEvent.keyDown(screen.getByLabelText("Menu"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not steal focus back when the user moved on before it closed", () => {
    setFrameWidth(800);
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <DeskSplit
          main={<button type="button">Opener</button>}
          side={<DeskInspector title="Details">x</DeskInspector>}
        />
      </>,
    );
    const elsewhere = screen.getByText("Elsewhere");
    elsewhere.focus();
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <DeskSplit main={<button type="button">Opener</button>} side={null} />
      </>,
    );
    expect(document.activeElement).toBe(elsewhere);
  });
});
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
