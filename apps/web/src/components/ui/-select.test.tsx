import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from "./select";

describe("Select", () => {
  it("places its portaled positioner on the overlay layer", async () => {
    render(
      <SelectRoot defaultValue="light">
        <SelectTrigger aria-label="Theme">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
        </SelectContent>
      </SelectRoot>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Theme" }));

    const darkOption = await screen.findByRole("option", { name: "Dark" });
    const popup = darkOption.closest('[data-slot="select-content"]');
    const positioner = popup?.parentElement;

    expect(positioner?.className).toContain("isolate");
    expect(positioner?.className).toContain("z-50");
  });
});
