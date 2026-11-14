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
    parsed: { ok: true, depth: null },
    depth: null,
    enabled: false,
    verification: { status: "ready", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
    ...overrides,
  } as never;
}

describe("CreditableBrowseControl", () => {
  it("rejects an invalid filter with a Clear action", () => {
    const clear = vi.fn();
    render(
      <CreditableBrowseControl
        state={state({ parsed: { ok: false }, blocksResults: true })}
        onChange={vi.fn()}
        onClear={clear}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("invalid Credit filter");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("shows sign-in guidance for an explicit guest Credit link", () => {
    render(
      <CreditableBrowseControl
        state={state({
          auth: { isAuthenticated: false, isLoading: false },
          enabled: true,
          blocksResults: true,
        })}
        onChange={vi.fn()}
        onClear={vi.fn()}
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
          depth: 1,
          verification: { status: "loading", pools: [], retry },
          blocksResults: true,
        })}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Credit: one hop" }).getAttribute("aria-busy")).toBe(
      "true",
    );

    view.rerender(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          depth: 1,
          verification: { status: "error", pools: [], retry },
          blocksResults: true,
        })}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("cycles OFF, one hop, two hops and back to OFF, saying which", () => {
    const change = vi.fn();
    const view = render(
      <CreditableBrowseControl state={state()} onChange={change} onClear={vi.fn()} />,
    );
    const off = screen.getByRole("button", { name: "Credit: off" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    expect(off.querySelectorAll("svg")).toHaveLength(1);
    fireEvent.click(off);
    expect(change.mock.calls.at(-1)?.[0]).toBe(1);

    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true, depth: 1 })}
        onChange={change}
        onClear={vi.fn()}
      />,
    );
    const one = screen.getByRole("button", { name: "Credit: one hop" });
    expect(one.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(one);
    expect(change.mock.calls.at(-1)?.[0]).toBe(2);

    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true, depth: 2 })}
        onChange={change}
        onClear={vi.fn()}
      />,
    );
    const two = screen.getByRole("button", { name: "Credit: up to two hops" });
    expect(two.getAttribute("aria-pressed")).toBe("true");
    expect(two.getAttribute("title")).toBe("Credit: up to two hops");
    fireEvent.click(two);
    expect(change.mock.calls.at(-1)?.[0]).toBeUndefined();
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("shows one check at one hop and a double check at two", () => {
    const view = render(
      <CreditableBrowseControl
        state={state({ enabled: true, depth: 1 })}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const one = screen.getByRole("button", { name: "Credit: one hop" }).innerHTML;
    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true, depth: 2 })}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const two = screen.getByRole("button", { name: "Credit: up to two hops" }).innerHTML;
    expect(one).not.toBe(two);
  });

  it("exposes its pressed and busy state without widening the label", () => {
    render(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          depth: 1,
          verification: { status: "loading", pools: [], retry: vi.fn() },
        })}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const credit = screen.getByRole("button", { name: "Credit: one hop" });
    expect(credit.getAttribute("aria-pressed")).toBe("true");
    expect(credit.getAttribute("aria-busy")).toBe("true");
    expect(credit.textContent).toBe("Credit");
  });

  it("stands 44px and solid green, rings itself when on, and spins while checking", () => {
    const view = render(
      <CreditableBrowseControl
        state={state()}
        onChange={vi.fn()}
        onClear={vi.fn()}
        part="control"
      />,
    );
    const off = screen.getByRole("button", { name: "Credit: off" });
    expect(off.getAttribute("data-size")).toBe("lg");
    expect(off.className).toContain("bg-success");
    expect(off.className).not.toContain("shadow-[inset");
    expect(off.querySelector("[data-slot=spinner]")).toBeNull();

    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true, depth: 1 })}
        onChange={vi.fn()}
        onClear={vi.fn()}
        part="control"
      />,
    );
    expect(screen.getByRole("button", { name: "Credit: one hop" }).className).toContain(
      "shadow-[inset_0_0_0_2px_var(--color-success-foreground)]",
    );

    view.rerender(
      <CreditableBrowseControl
        state={state({
          enabled: true,
          depth: 1,
          verification: { status: "loading", pools: [], retry: vi.fn() },
        })}
        onChange={vi.fn()}
        onClear={vi.fn()}
        part="control"
      />,
    );
    const on = screen.getByRole("button", { name: "Credit: one hop" });
    expect(on.className).toContain("bg-success text-success-foreground");
    expect(on.querySelector("[data-slot=spinner]")).toBeTruthy();
  });

  it("says when the feedback part has something to show", () => {
    expect(hasCreditFeedback(state())).toBe(false);
    expect(hasCreditFeedback(state({ parsed: { ok: false } }))).toBe(true);
    expect(hasCreditFeedback(state({ enabled: true, depth: 1 }))).toBe(false);
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
