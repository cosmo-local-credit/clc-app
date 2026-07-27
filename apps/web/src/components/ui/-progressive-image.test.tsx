import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ProgressiveImage } from "./progressive-image";

describe("ProgressiveImage", () => {
  it("keeps a progressive network image hidden behind a skeleton until load", () => {
    const { container } = render(
      <div className="relative size-20">
        <ProgressiveImage src="https://content.example/voucher.jpg" alt="Voucher" />
      </div>,
    );
    const image = container.querySelector("img") as HTMLImageElement;

    expect(image.dataset.state).toBe("loading");
    expect(image.className).toContain("opacity-0");
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();

    fireEvent.load(image);

    expect(image.dataset.state).toBe("loaded");
    expect(image.className).toContain("opacity-100");
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("starts loading again when the source changes", () => {
    const { container, rerender } = render(
      <div className="relative size-20">
        <ProgressiveImage src="https://content.example/first.jpg" alt="Voucher" />
      </div>,
    );
    fireEvent.load(container.querySelector("img") as HTMLImageElement);

    rerender(
      <div className="relative size-20">
        <ProgressiveImage src="https://content.example/second.jpg" alt="Voucher" />
      </div>,
    );

    expect((container.querySelector("img") as HTMLImageElement).dataset.state).toBe("loading");
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });
});
