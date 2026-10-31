import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { PLATFORM_ABOUT_URL } from "#/lib/legal";

// Embla measures the DOM, which jsdom does not lay out. The fake keeps one
// selected slide and fires "select" the way Embla does after every move.
const embla = vi.hoisted(() => {
  const listeners = new Map<string, Set<(api: unknown) => void>>();
  const state = { index: 0, count: 7 };
  const api = {
    canScrollPrev: () => state.index > 0,
    canScrollNext: () => state.index < state.count - 1,
    selectedScrollSnap: () => state.index,
    scrollPrev: vi.fn(() => move(state.index - 1)),
    scrollNext: vi.fn(() => move(state.index + 1)),
    scrollTo: vi.fn((index: number) => move(index)),
    on: vi.fn((event: string, listener: (api: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
    }),
    off: vi.fn((event: string, listener: (api: unknown) => void) => {
      listeners.get(event)?.delete(listener);
    }),
  };
  function move(index: number) {
    state.index = Math.max(0, Math.min(state.count - 1, index));
    listeners.get("select")?.forEach((listener) => listener(api));
  }
  return { api, state, listeners, useEmbla: vi.fn(() => [vi.fn(), api]) };
});
vi.mock("embla-carousel-react", () => ({ default: embla.useEmbla }));
vi.mock("#/components/language-selector", () => ({ OnboardingMenu: () => null }));

import { GuideCarousel, Introduction } from "./introduction";

const TITLES = [
  "Cosmo-Local Credit",
  "What is a voucher?",
  "What is an offer?",
  "What's a pool?",
  "Send a voucher",
  "Receive a voucher",
  "Your wallet",
];

/** The slide Embla shows: every other one is inert. */
function currentSlide() {
  return screen.getAllByRole("group").find((slide) => !slide.hasAttribute("inert"));
}

beforeEach(() => {
  embla.state.index = 0;
  embla.listeners.clear();
  vi.clearAllMocks();
});

it("walks the seven slides with the arrows and stops at the last", () => {
  render(<GuideCarousel />);
  const back = screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
  const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  expect(back.disabled).toBe(true);
  for (const title of TITLES.slice(0, -1)) {
    expect(currentSlide()?.getAttribute("aria-label")).toBe(title);
    fireEvent.click(next);
  }
  expect(currentSlide()?.getAttribute("aria-label")).toBe("Your wallet");
  expect(next.disabled).toBe(true);
  fireEvent.click(back);
  expect(currentSlide()?.getAttribute("aria-label")).toBe("Receive a voucher");
});

it("jumps to a slide from its segment and marks it current", () => {
  render(<GuideCarousel />);
  const segment = screen.getByRole("button", { name: "What's a pool?" });
  fireEvent.click(segment);
  expect(embla.api.scrollTo).toHaveBeenCalledWith(3);
  expect(segment.getAttribute("aria-current")).toBe("true");
  expect(currentSlide()?.getAttribute("aria-label")).toBe("What's a pool?");
});

it("gives Welcome its page title on the first slide only", () => {
  render(<GuideCarousel welcome />);
  expect(screen.getByRole("heading", { level: 1, name: "Cosmo-Local Credit" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(6);
});

it("places the copy above the picture and keeps the arrows out of the track", () => {
  const { container } = render(<GuideCarousel welcome />);
  const heading = screen.getByRole("heading", { level: 1, name: "Cosmo-Local Credit" });
  const art = container.querySelector("[data-art='network']");
  expect(art).toBeTruthy();
  expect(heading.compareDocumentPosition(art as Node) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
    0,
  );
  const back = screen.getByRole("button", { name: "Back" });
  expect(back.closest("[data-slot='carousel-item']")).toBeNull();
  expect(heading.closest("[data-slot='carousel-item']")?.contains(art as Node)).toBe(true);
});

it("ends the first slide with the About link", () => {
  render(<GuideCarousel />);
  const about = screen.getByRole("link", { name: "About Cosmo-Local Credit" });
  expect(about.getAttribute("href")).toBe(PLATFORM_ABOUT_URL);
  expect(about.getAttribute("target")).toBe("_blank");
  expect(about.closest("p")?.textContent).toBe(
    "Cosmo-Local Credit helps people and organizations support, share, and exchange goods and services. About Cosmo-Local Credit",
  );
});

it("replays from Settings with Next until Done, and closes at any point", () => {
  const done = vi.fn();
  render(<Introduction onDone={done} />);
  const footerNext = () => screen.getAllByRole("button", { name: "Next" }).at(-1) as HTMLElement;
  for (let step = 0; step < TITLES.length - 1; step++) fireEvent.click(footerNext());
  expect(currentSlide()?.getAttribute("aria-label")).toBe("Your wallet");
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(done).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(done).toHaveBeenCalledTimes(2);
});
