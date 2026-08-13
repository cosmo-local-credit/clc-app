import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setTheme } from "#/providers/theme";
import { SettingsPage } from "./settings-page";

afterEach(() => {
  setTheme("light");
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

describe("SettingsPage", () => {
  it("hosts the dark-mode toggle that used to live in the navbar", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Dark mode")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /dark mode/i })).toBeTruthy();
    expect(screen.queryByLabelText(/switch to .* theme/i)).toBeNull();
  });

  it("applies the dark class when the switch is turned on", () => {
    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    expect(toggle.getAttribute("data-checked")).toBeNull();

    fireEvent.click(toggle);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("clc.admin.theme")).toBe("dark");
  });
});
