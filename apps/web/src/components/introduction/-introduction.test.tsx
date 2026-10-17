import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Introduction } from "./introduction";
const locale = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  locale: "en",
  setLocale: vi.fn(),
}));
vi.mock("#/providers/i18n", () => ({ useLocale: () => locale }));
vi.mock("#/components/language-selector", () => ({
  LanguageSelector: () => <button>Language</button>,
}));
beforeEach(() => {
  locale.loading = false;
  locale.error = null;
});

it("shows language before five slides and creates an account only at the end", () => {
  const exit = vi.fn();
  render(<Introduction onExit={exit} />);
  expect(screen.queryByText("Your wallet")).toBeNull();
  fireEvent.click(screen.getByText("Continue"));
  for (const title of [
    "Your wallet",
    "What is a voucher?",
    "What is an offer?",
    "Send a voucher",
  ]) {
    expect(screen.getByRole("heading", { name: title })).toBe(document.activeElement);
    fireEvent.click(screen.getByText("Next"));
    expect(exit).not.toHaveBeenCalled();
  }
  expect(screen.getByRole("heading", { name: "Receive a voucher" })).toBeTruthy();
  fireEvent.click(screen.getByText("Create account"));
  expect(exit).toHaveBeenCalledWith("create");
});

it("preserves the slide while language loads and blocks progression after a load error", () => {
  const view = render(<Introduction replay onExit={vi.fn()} />);
  fireEvent.click(screen.getByText("Next"));
  locale.loading = true;
  view.rerender(<Introduction replay onExit={vi.fn()} />);
  expect((screen.getByText("Next").closest("button") as HTMLButtonElement).disabled).toBe(true);
  locale.loading = false;
  view.rerender(<Introduction replay onExit={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "What is a voucher?" })).toBeTruthy();
  locale.error = "Load failed";
  view.rerender(<Introduction replay onExit={vi.fn()} />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect((screen.getByText("Next").closest("button") as HTMLButtonElement).disabled).toBe(true);
});

it("supports Back and ends replay without account actions", () => {
  const exit = vi.fn();
  render(<Introduction replay onExit={exit} />);
  fireEvent.click(screen.getByText("Next"));
  fireEvent.click(screen.getByText("Back"));
  expect(screen.getByRole("heading", { name: "Your wallet" })).toBeTruthy();
  for (let n = 0; n < 4; n++) fireEvent.click(screen.getByText("Next"));
  expect(screen.queryByText("Create account")).toBeNull();
  fireEvent.click(screen.getByText("Done"));
  expect(exit).toHaveBeenCalledWith("done");
});

it("keeps inline guidance in the welcome page when the last slide advances", () => {
  const exit = vi.fn();
  render(<Introduction inline onExit={exit} />);
  expect(screen.getByRole("heading", { name: "Your wallet", level: 2 })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  for (let n = 0; n < 4; n++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Receive a voucher", level: 2 })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Your wallet", level: 2 })).toBeTruthy();
  expect(exit).not.toHaveBeenCalled();
});

it("lays every slide's text in one cell so the guide never shifts between slides", () => {
  render(<Introduction inline onExit={vi.fn()} />);
  // All five slides' text is present to size the cell; only the current one is exposed.
  const cell = screen.getByRole("heading", { name: "Your wallet", level: 2 }).closest(".grid");
  expect(cell?.children).toHaveLength(5);
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "What is a voucher?", level: 2 })).toBeTruthy();
});

it("keeps the second button's place so Next stays put until Create account", () => {
  render(<Introduction replay={false} onExit={vi.fn()} />);
  fireEvent.click(screen.getByText("Continue"));
  const footer = screen.getByText("Next").closest("footer") as HTMLElement;
  const before = footer.children.length;
  for (let n = 0; n < 4; n++) fireEvent.click(screen.getByText("Next"));
  expect(screen.getByText("Create account")).toBeTruthy();
  expect(footer.children.length).toBe(before);
});
