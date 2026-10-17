import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Button } from "./button";

function classesOf(element: HTMLElement) {
  return element.className.split(/\s+/);
}

describe("Button", () => {
  it("is compact by default: 36px with a 12px label", () => {
    render(<Button>Retry</Button>);
    const classes = classesOf(screen.getByRole("button", { name: "Retry" }));

    expect(classes).toContain("h-9");
    expect(classes).toContain("text-xs");
    expect(classes).not.toContain("text-sm");
  });

  it("is 44px with a 14px label at lg", () => {
    render(<Button size="lg">Send</Button>);
    const button = screen.getByRole("button", { name: "Send" });
    const classes = classesOf(button);

    expect(classes).toContain("h-11");
    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("text-xs");
    expect(button.getAttribute("data-size")).toBe("lg");
  });

  it("sizes icon buttons to 36px and 44px", () => {
    render(
      <>
        <Button size="icon" aria-label="Copy" />
        <Button size="icon-lg" aria-label="Menu" />
      </>,
    );

    expect(classesOf(screen.getByRole("button", { name: "Copy" }))).toContain("size-9");
    expect(classesOf(screen.getByRole("button", { name: "Menu" }))).toContain("size-11");
  });

  it("pads a compact button's hit area to 44px with tap", () => {
    render(
      <>
        <Button tap>Edit</Button>
        <Button>View</Button>
      </>,
    );
    const tapped = classesOf(screen.getByRole("button", { name: "Edit" }));
    const plain = classesOf(screen.getByRole("button", { name: "View" }));

    expect(tapped).toContain("h-9");
    expect(tapped).toContain("relative");
    expect(tapped).toContain("before:absolute");
    expect(tapped).toContain("before:-inset-y-1");
    expect(tapped).toContain("before:inset-x-0");
    expect(plain.some((name) => name.startsWith("before:"))).toBe(false);
  });

  it("pads a compact icon button on every side with tap", () => {
    render(<Button size="icon" tap aria-label="Close" />);
    const classes = classesOf(screen.getByRole("button", { name: "Close" }));

    expect(classes).toContain("size-9");
    expect(classes).toContain("before:-inset-1");
  });

  it("adds no pad to a 44px button that already meets the target", () => {
    render(
      <>
        <Button size="lg" tap>
          Save
        </Button>
        <Button size="icon-lg" tap aria-label="Locate" />
      </>,
    );

    for (const name of ["Save", "Locate"]) {
      const classes = classesOf(screen.getByRole("button", { name }));
      expect(classes.some((value) => value.startsWith("before:"))).toBe(false);
    }
  });

  it("carries the pad onto an asChild element without leaking the prop", () => {
    render(
      <Button asChild tap>
        <a href="/posts/new">New post</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "New post" });

    expect(classesOf(link)).toContain("before:-inset-y-1");
    expect(link.hasAttribute("tap")).toBe(false);
  });

  it("lets a positioned caller keep its own position under the pad", () => {
    render(<Button size="icon" tap className="absolute end-0" aria-label="Clear search" />);
    const classes = classesOf(screen.getByRole("button", { name: "Clear search" }));

    expect(classes).toContain("absolute");
    expect(classes).not.toContain("relative");
  });
});
