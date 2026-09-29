import { fireEvent } from "@testing-library/react";
import { act, type ComponentProps, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  canGoBack: false,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: ComponentProps<"a"> & {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useCanGoBack: () => mocks.canGoBack,
  useRouter: () => ({ history: { back: mocks.back } }),
}));

import { BackChevron } from "./wallet-layout";

describe("BackChevron", () => {
  it("marks the semantic back arrow to mirror in RTL", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<BackChevron label="Market" to="/" />);

    expect(container.querySelector("svg")?.getAttribute("class")).toContain("rtl:-scale-x-100");
  });

  it("hydrates without changing element type when client history can go back", async () => {
    mocks.back.mockReset();
    mocks.canGoBack = false;
    const serverHtml = renderToString(<BackChevron label="Market" to="/" />);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;

    mocks.canGoBack = true;
    const recoverableError = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <BackChevron label="Market" to="/" />, {
        onRecoverableError: recoverableError,
      });
    });

    expect(recoverableError).not.toHaveBeenCalled();
    const backLink = container.querySelector("a");
    expect(backLink).toBeTruthy();
    fireEvent.click(backLink as HTMLAnchorElement);
    expect(mocks.back).toHaveBeenCalledOnce();

    await act(async () => root?.unmount());
  });
});
