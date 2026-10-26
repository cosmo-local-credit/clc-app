import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AuthenticatedDetailsGate } from "./authenticated-details-gate";

const mocks = vi.hoisted(() => ({
  auth: {
    state: "guest",
    isLoading: false,
    isAuthenticated: false,
    retry: vi.fn(),
    retrying: false,
  },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    search,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    search: { step: string; redirect?: string };
    children: ReactNode;
  }) => (
    <a
      {...props}
      href={`/onboarding?step=${search.step}&redirect=${encodeURIComponent(search.redirect ?? "")}`}
    >
      {children}
    </a>
  ),
}));

function renderGate(children: ReactNode = <div>Private details</div>) {
  return render(<AuthenticatedDetailsGate>{children}</AuthenticatedDetailsGate>);
}

describe("AuthenticatedDetailsGate", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/wants/7?poolAddress=0xabc#contact");
    mocks.auth.state = "guest";
    mocks.auth.isLoading = false;
    mocks.auth.isAuthenticated = false;
    mocks.auth.retrying = false;
    mocks.auth.retry.mockReset();
  });

  it("does not mount private children and preserves the current resource as sign-in redirect", () => {
    renderGate();

    expect(screen.queryByText("Private details")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/onboarding?step=signin&redirect=%2Fwants%2F7%3FpoolAddress%3D0xabc%23contact",
    );
  });

  it("mounts private children only for a verified session", () => {
    mocks.auth.state = "authenticated";
    mocks.auth.isAuthenticated = true;
    renderGate();

    expect(screen.getByText("Private details")).not.toBeNull();
  });

  it("shows pending and retry states without mounting private children", () => {
    mocks.auth.state = "loading";
    mocks.auth.isLoading = true;
    const pending = renderGate();
    expect(screen.getByLabelText("Checking your session…").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Private details")).toBeNull();
    pending.unmount();

    mocks.auth.state = "sessionCheckError";
    mocks.auth.isLoading = false;
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.auth.retry).toHaveBeenCalledOnce();
  });
});
