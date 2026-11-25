import { BackendApiError } from "@clc/api/client/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { adminSessionQueryKey } from "#/features/auth/admin-session";
import { AuthBoundary } from "./auth-boundary";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("#/lib/api", () => ({ clcApi: { auth: { getSession } } }));
vi.mock("#/features/auth/ui/sign-in-panel", () => ({
  SignInPanel: () => <p>Operator sign-in</p>,
}));

const operator = {
  address: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
  role: "SUPERADMIN",
  chainId: 100,
};
const protectedKey = ["clc", "admin", "private-fixture"];

function renderConsole() {
  const client = new QueryClient();
  client.setQueryData(adminSessionQueryKey, operator);
  client.setQueryData(protectedKey, ["operator's cached rows"]);
  render(
    <QueryClientProvider client={client}>
      <AuthBoundary>Operator console</AuthBoundary>
    </QueryClientProvider>,
  );
  return client;
}

describe("Admin session recovery", () => {
  it("keeps the cache scoped, closes the console, and recovers with Retry after transient retries exhaust", async () => {
    getSession.mockReset();
    const noJitter = vi.spyOn(Math, "random").mockReturnValue(0);
    getSession.mockRejectedValue(
      new BackendApiError(503, "Session lookup temporarily unavailable", undefined, {
        retryAfterMs: 0,
      }),
    );
    const client = renderConsole();
    expect(screen.getByText("Operator console")).toBeTruthy();

    try {
      await act(() => client.invalidateQueries({ queryKey: adminSessionQueryKey }));
      expect(getSession).toHaveBeenCalledTimes(3);
      expect(screen.getByRole("alert").textContent).toContain("Session check failed");
      expect(screen.queryByText("Operator console")).toBeNull();
      expect(screen.queryByText("Operator sign-in")).toBeNull();
      expect(client.getQueryData(protectedKey)).toEqual(["operator's cached rows"]);

      const retry = await screen.findByRole("button", { name: "Retry" });
      getSession.mockResolvedValueOnce(operator);
      fireEvent.click(retry);
      expect(await screen.findByText("Operator console")).toBeTruthy();
      expect(client.getQueryData(protectedKey)).toEqual(["operator's cached rows"]);
    } finally {
      noJitter.mockRestore();
    }
  });

  it("clears the previous operator's cache when the check confirms expiry", async () => {
    getSession.mockReset().mockResolvedValueOnce(null);
    const client = renderConsole();
    await act(() => client.invalidateQueries({ queryKey: adminSessionQueryKey }));

    expect(await screen.findByText("Operator sign-in")).toBeTruthy();
    expect(client.getQueryData(protectedKey)).toBeUndefined();
  });

  it("drops cached operator data before re-opening for a different wallet", async () => {
    getSession.mockReset().mockResolvedValueOnce({
      ...operator,
      address: "0x9999999999999999999999999999999999999999",
    });
    const client = renderConsole();
    await act(() => client.invalidateQueries({ queryKey: adminSessionQueryKey }));

    expect(screen.getByText("Operator console")).toBeTruthy();
    expect(client.getQueryData(protectedKey)).toBeUndefined();
  });
});
