import { fireEvent, render, screen } from "@testing-library/react";
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
  });
});

describe("DeskInspector", () => {
  it("moves focus in on open and returns it to the opener on close when overlaid", () => {
    setFrameWidth(800);
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open row" });
    opener.focus();
    fireEvent.click(opener);

    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Details" }));

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
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
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
