import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ReportMarkerStyleField } from "./marker-style-field";

describe("ReportMarkerStyleField", () => {
  it("selects a Post glyph while preserving its legacy wire colour", () => {
    const onChange = vi.fn();
    render(<ReportMarkerStyleField value="post" onChange={onChange} />);

    expect(screen.getAllByText("Post")).toHaveLength(2);
    expect(document.querySelector('path[fill="#52525B"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Event" }));

    expect(onChange).toHaveBeenCalledWith("event");
    expect(screen.queryByRole("button", { name: "Cyan" })).toBeNull();
  });

  it("disables icon choices while the editor is pending", () => {
    render(<ReportMarkerStyleField value="announcement" onChange={vi.fn()} disabled />);

    expect(screen.getByRole("button", { name: "Post" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Blue" })).toBeNull();
  });
});
