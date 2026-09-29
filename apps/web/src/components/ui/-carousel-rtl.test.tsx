import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const embla = vi.hoisted(() => {
  const api = {
    canScrollPrev: vi.fn(() => true),
    canScrollNext: vi.fn(() => true),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return {
    api,
    useEmbla: vi.fn(() => [vi.fn(), api]),
  };
});

vi.mock("embla-carousel-react", () => ({ default: embla.useEmbla }));

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";

describe("Carousel RTL behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes RTL to Embla and reverses horizontal arrow-key navigation", () => {
    render(
      <Carousel direction="rtl">
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(embla.useEmbla).toHaveBeenCalledWith(
      expect.objectContaining({ axis: "x", direction: "rtl" }),
      undefined,
    );

    const carousel = screen.getByRole("region");
    expect(carousel.getAttribute("dir")).toBe("rtl");
    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(embla.api.scrollNext).toHaveBeenCalledOnce();
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(embla.api.scrollPrev).toHaveBeenCalledOnce();
  });

  it("uses logical control edges and mirrors semantic arrow icons", () => {
    render(
      <Carousel direction="rtl">
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
        </CarouselContent>
        <CarouselPrevious label="Previous" />
        <CarouselNext label="Next" />
      </Carousel>,
    );

    const previous = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(previous.className).toContain("-start-12");
    expect(next.className).toContain("-end-12");
    expect(previous.querySelector("svg")?.getAttribute("class")).toContain("rtl:-scale-x-100");
    expect(next.querySelector("svg")?.getAttribute("class")).toContain("rtl:-scale-x-100");
  });
});
