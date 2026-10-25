import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ReportMarkerStyleField } from "./marker-style-field";

describe("ReportMarkerStyleField", () => {
  it("selects each required Post marker dimension independently", () => {
    const onChange = vi.fn();
    render(<ReportMarkerStyleField value={{ icon: "post", color: "pink" }} onChange={onChange} />);

    expect(screen.getByText("Post, Pink")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Event" }));
    fireEvent.click(screen.getByRole("button", { name: "Cyan" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { icon: "event", color: "pink" });
    expect(onChange).toHaveBeenNthCalledWith(2, { icon: "post", color: "cyan" });
  });

  it("disables icon and colour choices while the editor is pending", () => {
    render(
      <ReportMarkerStyleField
        value={{ icon: "announcement", color: "purple" }}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole("button", { name: "Post" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Blue" }).hasAttribute("disabled")).toBe(true);
  });
});
