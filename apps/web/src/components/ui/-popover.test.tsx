import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { PopoverClose, PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "./popover";

function TestPopover({ dir = "ltr" }: { dir?: "ltr" | "rtl" }) {
  return (
    <div dir={dir}>
      <PopoverRoot>
        <PopoverTrigger>Open tools</PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <PopoverTitle>Tools</PopoverTitle>
          <button type="button">First action</button>
          <PopoverClose>Close tools</PopoverClose>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}

describe("Popover", () => {
  it("opens from an accessible trigger and closes with Escape", async () => {
    render(<TestPopover />);
    const trigger = screen.getByRole("button", { name: "Open tools" });

    fireEvent.click(trigger);

    expect(await screen.findByText("First action")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("First action")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses on an outside pointer press", async () => {
    render(<TestPopover />);
    fireEvent.click(screen.getByRole("button", { name: "Open tools" }));
    expect(await screen.findByText("First action")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByText("First action")).toBeNull());
  });

  it("retains logical start alignment in RTL and constrains content to available height", async () => {
    render(<TestPopover dir="rtl" />);
    fireEvent.click(screen.getByRole("button", { name: "Open tools" }));

    const popup = (await screen.findByText("First action")).parentElement;
    expect(popup?.className).toContain("max-h-[var(--available-height)]");
    expect(popup?.parentElement?.getAttribute("data-align")).toBe("start");
  });

  it("transitions the scale it enters and leaves with, so closing does not snap", async () => {
    render(<TestPopover />);
    fireEvent.click(screen.getByRole("button", { name: "Open tools" }));

    // Tailwind 4 compiles `scale-95` to the `scale` property, not `transform`.
    const popup = (await screen.findByText("First action")).parentElement;
    expect(popup?.className).toContain("data-[ending-style]:scale-95");
    expect(popup?.className).toContain("transition-[opacity,scale]");
  });
});
