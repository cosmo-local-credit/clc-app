import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { CreditableBrowseControl, hasCreditFeedback } from "./creditable-browse-control";

function state(overrides: Record<string, unknown> = {}) {
  return {
    auth: { isAuthenticated: true, isLoading: false },
    enabled: false,
    verification: { status: "ready", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
    ...overrides,
  } as never;
}

describe("CreditableBrowseControl", () => {
  it("shows sign-in guidance for an explicit guest Credit link", () => {
    render(
      <CreditableBrowseControl
        state={state({
          auth: { isAuthenticated: false, isLoading: false },
          enabled: true,
          blocksResults: true,
        })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sign in to browse results/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Credit/ })).toBeNull();
  });

  it("keeps verification loading and errors explicit", () => {
    const retry = vi.fn();
    const view = render(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          verification: { status: "loading", pools: [], retry },
          blocksResults: true,
        })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Credit: on" }).getAttribute("aria-busy")).toBe(
      "true",
    );

    view.rerender(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          verification: { status: "error", pools: [], retry },
          blocksResults: true,
        })}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("toggles off to on and on to off, saying which", () => {
    const change = vi.fn();
    const view = render(<CreditableBrowseControl state={state()} onChange={change} />);
    const off = screen.getByRole("button", { name: "Credit: off" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    expect(off.getAttribute("title")).toBe("Credit: off");
    expect(off.querySelectorAll("svg")).toHaveLength(1);
    fireEvent.click(off);
    expect(change).toHaveBeenLastCalledWith(true);

    view.rerender(<CreditableBrowseControl state={state({ enabled: true })} onChange={change} />);
    const on = screen.getByRole("button", { name: "Credit: on" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.getAttribute("title")).toBe("Credit: on");
    fireEvent.click(on);
    expect(change).toHaveBeenLastCalledWith(false);
    expect(change).toHaveBeenCalledTimes(2);
  });

  it("leads with a different icon on and off", () => {
    const view = render(<CreditableBrowseControl state={state()} onChange={vi.fn()} />);
    const off = screen.getByRole("button", { name: "Credit: off" }).innerHTML;
    view.rerender(<CreditableBrowseControl state={state({ enabled: true })} onChange={vi.fn()} />);
    const on = screen.getByRole("button", { name: "Credit: on" }).innerHTML;
    expect(on).not.toBe(off);
  });

  it("exposes its pressed and busy state without widening the label", () => {
    render(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          verification: { status: "loading", pools: [], retry: vi.fn() },
        })}
        onChange={vi.fn()}
      />,
    );

    const credit = screen.getByRole("button", { name: "Credit: on" });
    expect(credit.getAttribute("aria-pressed")).toBe("true");
    expect(credit.getAttribute("aria-busy")).toBe("true");
    expect(credit.textContent).toBe("Credit");
  });

  it("stands 44px and solid green, rings itself when on, and spins while checking", () => {
    const view = render(
      <CreditableBrowseControl state={state()} onChange={vi.fn()} part="control" />,
    );
    const off = screen.getByRole("button", { name: "Credit: off" });
    expect(off.getAttribute("data-size")).toBe("lg");
    expect(off.className).toContain("bg-success");
    expect(off.className).not.toContain("shadow-[inset");
    expect(off.querySelector("[data-slot=spinner]")).toBeNull();

    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true })}
        onChange={vi.fn()}
        part="control"
      />,
    );
    expect(screen.getByRole("button", { name: "Credit: on" }).className).toContain(
      "shadow-[inset_0_0_0_2px_var(--color-success-foreground)]",
    );

    view.rerender(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          verification: { status: "loading", pools: [], retry: vi.fn() },
        })}
        onChange={vi.fn()}
        part="control"
      />,
    );
    const on = screen.getByRole("button", { name: "Credit: on" });
    expect(on.className).toContain("bg-success text-success-foreground");
    expect(on.querySelector("[data-slot=spinner]")).toBeTruthy();
  });

  it("says when the feedback part has something to show", () => {
    expect(hasCreditFeedback(state())).toBe(false);
    expect(hasCreditFeedback(state({ enabled: true }))).toBe(false);
    expect(
      hasCreditFeedback(
        state({ enabled: true, auth: { isAuthenticated: false, isLoading: false } }),
      ),
    ).toBe(true);
    expect(
      hasCreditFeedback(
        state({ enabled: true, verification: { status: "error", pools: [], retry: vi.fn() } }),
      ),
    ).toBe(true);
  });
});
