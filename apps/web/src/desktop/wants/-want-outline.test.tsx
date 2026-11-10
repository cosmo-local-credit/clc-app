import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { WantOutline } from "./want-outline";

const PARTS = ["want", "when", "where", "picture", "contact"];

function Page() {
  return (
    <>
      <WantOutline />
      {PARTS.map((part) => (
        <div key={part} id={`want-part-${part}`} />
      ))}
    </>
  );
}

function prefersReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WantOutline", () => {
  it("scrolls to the part smoothly by default", () => {
    prefersReducedMotion(false);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<Page />);

    fireEvent.click(screen.getByRole("link", { name: "When" }));

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById("want-part-when"));
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("jumps instead of animating when the system asks for reduced motion", () => {
    prefersReducedMotion(true);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<Page />);

    fireEvent.click(screen.getByRole("link", { name: "Contact" }));

    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("marks the first part current and keeps every section reachable as a link", () => {
    render(<Page />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      PARTS.map((part) => `#want-part-${part}`),
    );
    expect(screen.getByRole("link", { name: "Want" }).getAttribute("aria-current")).toBe(
      "location",
    );
    expect(screen.getByRole("link", { name: "When" }).getAttribute("aria-current")).toBeNull();
  });

  it("is a wrapped row until the canvas can seat it beside the form", () => {
    render(<Page />);

    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(nav.className).toContain("flex-wrap");
    expect(nav.className).toContain("@min-[43rem]:grid");
    expect(nav.className).toContain("@min-[43rem]:sticky");
    const link = screen.getByRole("link", { name: "Where" });
    expect(link.className).toContain("border-b-2");
    expect(link.className).toContain("@min-[43rem]:border-s-2");
  });
});
