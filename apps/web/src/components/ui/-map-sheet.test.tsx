import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { MapSheet, MapSheetPeek, MapSheetTitle, type MapSheetSnap } from "./map-sheet";

function Harness({
  initialSnap = "peek",
  modal = false,
  onSnapChange,
  onClose = vi.fn(),
  onCoveredHeightChange,
}: {
  initialSnap?: MapSheetSnap;
  modal?: boolean;
  onSnapChange?: (snap: MapSheetSnap) => void;
  onClose?: () => void;
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
}) {
  const [snap, setSnap] = useState<MapSheetSnap>(initialSnap);
  return (
    <MapSheet
      open
      modal={modal}
      snap={snap}
      onSnapChange={(next) => {
        onSnapChange?.(next);
        setSnap(next);
      }}
      onClose={onClose}
      onCoveredHeightChange={onCoveredHeightChange}
    >
      <MapSheetPeek>
        <MapSheetTitle>Mama Mboga</MapSheetTitle>
      </MapSheetPeek>
      <p>More detail</p>
    </MapSheet>
  );
}

function scrollArea() {
  const area = screen.getByText("More detail").parentElement;
  if (!area) throw new Error("expected the sheet's scroll area");
  return area;
}

function pressOutside(target: Element) {
  act(() => {
    fireEvent.pointerDown(target, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(target, { button: 0 });
    fireEvent.pointerUp(target, { pointerType: "mouse", button: 0 });
    fireEvent.mouseUp(target, { button: 0 });
    fireEvent.click(target, { button: 0 });
  });
}

describe("MapSheet", () => {
  it("leaves a tap outside to the screen beneath when it sits over a map", () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button">Map</button>
        <Harness onClose={onClose} />
      </>,
    );

    expect(document.querySelector("[data-map-sheet-backdrop]")).toBeNull();
    pressOutside(screen.getByRole("button", { name: "Map" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("dims the screen and closes on a tap outside, like any other sheet, off a map", () => {
    const onClose = vi.fn();
    render(<Harness modal onClose={onClose} />);

    const backdrop = document.querySelector("[data-map-sheet-backdrop]");
    if (!backdrop) throw new Error("expected a backdrop");
    pressOutside(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("names the sheet from its title", () => {
    render(<Harness />);

    expect(screen.getByRole("dialog", { name: "Mama Mboga" })).toBeTruthy();
  });

  it("steps through every snap point from the handle and reports each one", () => {
    const onSnapChange = vi.fn();
    render(<Harness onSnapChange={onSnapChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(onSnapChange.mock.calls).toEqual([["half"], ["full"], ["peek"]]);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports the height it covers once it settles at a snap point", () => {
    const onCoveredHeightChange = vi.fn();
    render(<Harness onCoveredHeightChange={onCoveredHeightChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(onCoveredHeightChange).toHaveBeenLastCalledWith(
      Math.round(window.innerHeight * 0.55),
      "half",
    );
  });

  it("scrolls its content only at full", () => {
    render(<Harness />);
    expect(scrollArea().className).toContain("overflow-hidden");

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(scrollArea().className).toContain("overflow-hidden");

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(scrollArea().className).toContain("overflow-y-auto");
  });

  it("measures the peek from the top of its content after collapsing from full", () => {
    const onCoveredHeightChange = vi.fn();
    render(<Harness initialSnap="full" onCoveredHeightChange={onCoveredHeightChange} />);
    const area = scrollArea();
    const peekBlock = screen.getByRole("heading", { name: "Mama Mboga" }).parentElement;
    if (!peekBlock) throw new Error("expected the peek block");
    area.scrollTop = 240;
    // jsdom lays nothing out. The peek block ends 150 px below the popup's
    // top, less however far the content is scrolled.
    vi.spyOn(screen.getByRole("dialog"), "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 360, 780),
    );
    vi.spyOn(peekBlock, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, -area.scrollTop, 360, 150),
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(onCoveredHeightChange).toHaveBeenLastCalledWith(150, "peek");
  });

  it("returns to the top of its content when it collapses from full", () => {
    render(<Harness initialSnap="full" />);
    const area = scrollArea();
    area.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(area.scrollTop).toBe(0);
  });
});
