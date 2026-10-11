import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { CreditableBrowseControl } from "./creditable-browse-control";

function state(overrides: Record<string, unknown> = {}) {
  return {
    auth: { isAuthenticated: true, isLoading: false },
    parsed: { ok: true, enabled: false },
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
    expect(screen.queryByRole("checkbox", { name: "Credit" })).toBeNull();
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
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("Checking…")).toBeTruthy();

    view.rerender(
      <CreditableBrowseControl
        state={state({
          enabled: true,
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

  it("writes both checked and unchecked manual choices", () => {
    const change = vi.fn();
    const view = render(
      <CreditableBrowseControl state={state()} onChange={change} onClear={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Credit" }));
    expect(change.mock.calls.at(-1)?.[0]).toBe(true);

    view.rerender(
      <CreditableBrowseControl
        state={state({ enabled: true })}
        onChange={change}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Credit" }));
    expect(change.mock.calls.at(-1)?.[0]).toBe(false);
  });
});
