import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ListSkeleton } from "./list-skeleton";

describe("ListSkeleton", () => {
  it("announces its label once and hides the placeholder shapes", () => {
    render(<ListSkeleton label="Loading pools…" count={4} />);
    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Loading pools…");
    const shapes = status.querySelector("[aria-hidden=true]");
    expect(shapes?.querySelectorAll(":scope > div")).toHaveLength(4);
  });

  it("draws square, motion-safe placeholders", () => {
    render(<ListSkeleton label="Loading…" shape="cards" count={1} />);
    const placeholder = screen.getByRole("status").querySelector("[data-slot=skeleton]");

    expect(placeholder?.className).toContain("rounded-none");
    expect(placeholder?.className).toContain("motion-safe:animate-pulse");
    expect(placeholder?.className).not.toContain("rounded-md");
  });

  it("leaves the frame to a panel that already draws one", () => {
    render(<ListSkeleton label="Loading activity…" framed={false} />);
    const shapes = screen.getByRole("status").querySelector("[aria-hidden=true]");

    expect(shapes?.className ?? "").not.toContain("border");
  });
});
