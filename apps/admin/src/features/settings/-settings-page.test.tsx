import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { setTheme } from "#/providers/theme";
import { SettingsPage } from "./settings-page";

vi.mock("#/lib/api", () => ({
  API_ORIGIN: "http://api.test",
  clcApi: {
    auth: {
      getWebAuthnCredentials: () =>
        Promise.resolve({
          address: "0x0000000000000000000000000000000000000001",
          credentials: [],
        }),
    },
  },
}));

afterEach(() => {
  setTheme("light");
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  it("hosts the dark-mode toggle that used to live in the navbar", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Dark mode")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /dark mode/i })).toBeTruthy();
    expect(screen.queryByLabelText(/switch to .* theme/i)).toBeNull();
  });

  it("shows the identity of the build this tab is running", () => {
    renderPage();

    // The vitest config inlines a dirty `0.0.0-test` build with an unknown commit.
    expect(screen.getByLabelText("Version").textContent).toBe("0.0.0-test");
    expect(screen.getByLabelText("Build number").textContent).toBe("1");
    expect(screen.getByLabelText("Commit").textContent).toBe("unknown (dirty)");
    expect(screen.getByLabelText("API").textContent).toBe("http://api.test");
    expect(screen.getByLabelText("Chain").textContent).toBeTruthy();
  });

  it("applies the dark class when the switch is turned on", () => {
    renderPage();

    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    expect(toggle.getAttribute("data-checked")).toBeNull();

    fireEvent.click(toggle);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("clc.admin.theme")).toBe("dark");
  });
});
