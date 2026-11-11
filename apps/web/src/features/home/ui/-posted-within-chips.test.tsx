import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { PostedWithinChips } from "./posted-within-chips";

describe("PostedWithinChips", () => {
  it("keeps one window selected and ignores a press that would clear it", () => {
    const onChange = vi.fn();
    render(<PostedWithinChips posted="1m" onChange={onChange} />);

    const group = screen.getByRole("group", { name: "Posted within" });
    fireEvent.click(screen.getByRole("button", { name: "1 month" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    expect(onChange).toHaveBeenCalledWith("1y");
    expect(
      [...group.querySelectorAll("button")].filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      ),
    ).toHaveLength(1);
  });
});
