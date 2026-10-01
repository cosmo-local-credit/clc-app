import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { MapSheet, MapSheetPeek, MapSheetTitle, type MapSheetSnap } from "./map-sheet";

function Harness({
  initialSnap = "peek",
  onSnapChange,
  onClose = vi.fn(),
  onCoveredHeightChange,
}: {
  initialSnap?: MapSheetSnap;
  onSnapChange?: (snap: MapSheetSnap) => void;
  onClose?: () => void;
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
}) {
  const [snap, setSnap] = useState<MapSheetSnap>(initialSnap);
  return (
    <MapSheet
      open
      snap={snap}
      onSnapChange={(next) => {
        onSnapChange?.(next);
        setSnap(next);
      }}
      onClose={onClose}
      onCoveredHeightChange={onCoveredHeightChange}
      appBar={<div data-testid="app-bar" />}
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

describe("MapSheet", () => {
  it("names the sheet from its title", () => {
    render(<Harness />);

    expect(screen.getByRole("dialog", { name: "Mama Mboga" })).toBeTruthy();
  });

  it("steps through every snap point from the handle and reports each one", () => {
    const onSnapChange = vi.fn();
    render(<Harness onSnapChange={onSnapChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByTestId("app-bar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(onSnapChange.mock.calls).toEqual([["half"], ["full"], ["peek"]]);
    expect(screen.queryByTestId("app-bar")).toBeNull();
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

  it("returns to the top of its content when it collapses from full", () => {
    render(<Harness initialSnap="full" />);
    const area = scrollArea();
    area.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(area.scrollTop).toBe(0);
  });
});
