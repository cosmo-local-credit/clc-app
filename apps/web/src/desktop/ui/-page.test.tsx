import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeskDetail } from "./page";

let width = 1200;
let notify: (() => void) | null = null;

class CapturingObserver {
  constructor(callback: () => void) {
    notify = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setup(stacked?: "main-first" | "side-first") {
  vi.stubGlobal("ResizeObserver", CapturingObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  return render(
    <DeskDetail
      stacked={stacked}
      main={<p>Main column</p>}
      side={<input aria-label="Amount" defaultValue="" />}
    />,
  );
}

function resizeTo(next: number) {
  width = next;
  act(() => notify?.());
}

/** Document order of the two columns, which is the order keyboards and screen readers use. */
function order() {
  const text = screen.getByText("Main column");
  const input = screen.getByLabelText("Amount");
  return text.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING
    ? ["main", "side"]
    : ["side", "main"];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  width = 1200;
  notify = null;
});

describe("DeskDetail order", () => {
  it("keeps the main column first when docked, even for a side-first page", () => {
    width = 1200;
    setup("side-first");
    expect(order()).toEqual(["main", "side"]);
  });

  it("puts the side column first in the DOM once it stacks, for a side-first page", () => {
    width = 800;
    setup("side-first");
    expect(order()).toEqual(["side", "main"]);
  });

  it("keeps main first when stacked unless the page asks otherwise", () => {
    width = 800;
    setup();
    expect(order()).toEqual(["main", "side"]);
  });

  it("follows a resize across the dock width without losing the side panel's state", () => {
    width = 1200;
    setup("side-first");
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "42.5" } });

    resizeTo(800);
    expect(order()).toEqual(["side", "main"]);
    // The same node, moved: not a fresh input.
    expect(screen.getByLabelText("Amount")).toBe(input);
    expect(input.value).toBe("42.5");

    resizeTo(1300);
    expect(order()).toEqual(["main", "side"]);
    expect(screen.getByLabelText("Amount")).toBe(input);
    expect(input.value).toBe("42.5");
  });

  it("treats an unmeasured frame as docked", () => {
    width = 0;
    setup("side-first");
    expect(order()).toEqual(["main", "side"]);
  });
});
