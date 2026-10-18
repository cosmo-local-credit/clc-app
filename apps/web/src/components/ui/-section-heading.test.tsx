import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { SectionHeading } from "./section-heading";

function classesOf(element: HTMLElement) {
  return element.getAttribute("class")?.split(/\s+/);
}

describe("SectionHeading", () => {
  it("is a 16px h2 content section by default", () => {
    render(<SectionHeading>Holdings</SectionHeading>);
    const heading = screen.getByRole("heading", { level: 2, name: "Holdings" });

    expect(classesOf(heading)).toEqual(
      expect.arrayContaining(["font-heading", "text-base", "font-semibold"]),
    );
  });

  it("labels a grouped panel at 14px", () => {
    render(<SectionHeading variant="group">Account</SectionHeading>);
    const classes = classesOf(screen.getByRole("heading", { name: "Account" }));

    expect(classes).toContain("text-sm");
    expect(classes).not.toContain("text-base");
  });

  it("takes its level from as without changing its look", () => {
    render(
      <SectionHeading as="h3" id="reviews" className="mb-3">
        Reviews
      </SectionHeading>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Reviews" });

    expect(heading.id).toBe("reviews");
    expect(classesOf(heading)).toEqual(expect.arrayContaining(["text-base", "mb-3"]));
  });
});
