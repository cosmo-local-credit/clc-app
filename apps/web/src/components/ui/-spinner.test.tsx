import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Spinner } from "./spinner";

function spinnerIn(container: HTMLElement) {
  const spinner = container.querySelector("[data-slot=spinner]");
  if (!spinner) throw new Error("No spinner rendered");
  return spinner;
}

describe("Spinner", () => {
  it("is decorative, so screen readers hear the label beside it", () => {
    const { container } = render(<Spinner />);

    expect(spinnerIn(container).getAttribute("aria-hidden")).toBe("true");
  });

  it("turns, and stops turning under reduced motion", () => {
    const classes = spinnerIn(render(<Spinner />).container)
      .getAttribute("class")
      ?.split(/\s+/);

    expect(classes).toContain("animate-spin");
    expect(classes).toContain("motion-reduce:animate-none");
  });

  it("is 16px unless the caller sizes it, and takes its colour from the caller", () => {
    const small = spinnerIn(render(<Spinner />).container)
      .getAttribute("class")
      ?.split(/\s+/);
    const large = spinnerIn(render(<Spinner className="size-6 text-primary" />).container)
      .getAttribute("class")
      ?.split(/\s+/);

    expect(small).toContain("size-4");
    expect(large).toContain("size-6");
    expect(large).toContain("text-primary");
    expect(large).not.toContain("size-4");
  });
});
