import { fireEvent, render, screen } from "@testing-library/react";
import { RiSendPlane2Line } from "react-icons/ri";
import { describe, expect, it, vi } from "vite-plus/test";

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

  describe("pending", () => {
    it("leads with the Spinner, disables the button and marks it busy", () => {
      const onClick = vi.fn();
      render(
        <Button size="lg" pending onClick={onClick}>
          <RiSendPlane2Line data-testid="own-icon" aria-hidden="true" />
          Sending…
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement;
      const spinner = button.querySelector("[data-slot=spinner]");

      expect(spinner).not.toBeNull();
      expect(button.firstElementChild).toBe(spinner);
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.hasAttribute("data-pending")).toBe(true);
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("hides the button's own icons but not the Spinner", () => {
      render(
        <Button pending>
          <RiSendPlane2Line aria-hidden="true" />
          Saving…
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Saving…" });

      expect(classesOf(button)).toContain("[&>svg:not([data-slot=spinner])]:hidden");
      expect(button.querySelectorAll("svg")).toHaveLength(2);
    });

    it("draws nothing extra and stays enabled when not pending", () => {
      render(<Button>Save</Button>);
      const button = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

      expect(button.querySelector("[data-slot=spinner]")).toBeNull();
      expect(button.disabled).toBe(false);
      expect(button.hasAttribute("aria-busy")).toBe(false);
      expect(button.hasAttribute("data-pending")).toBe(false);
      expect(classesOf(button).some((name) => name.includes("data-slot=spinner"))).toBe(false);
    });

    it("keeps a link from navigating while pending through asChild", () => {
      const onClick = vi.fn();
      render(
        <Button asChild pending onClick={onClick}>
          <a href="/wallet">Open wallet</a>
        </Button>,
      );
      const link = screen.getByRole("link", { name: "Open wallet" });

      expect(link.firstElementChild?.getAttribute("data-slot")).toBe("spinner");
      expect(link.getAttribute("aria-busy")).toBe("true");
      expect(link.getAttribute("aria-disabled")).toBe("true");
      expect(classesOf(link)).toContain("pointer-events-none");
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
