import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("reveals and conceals the unchanged value with current-state icons", () => {
    render(<PasswordInput aria-label="Password" value="sunflower" readOnly />);
    const input = screen.getByLabelText("Password");
    const show = screen.getByRole("button", { name: "Show password" });

    expect(input.getAttribute("type")).toBe("password");
    expect((input as HTMLInputElement).value).toBe("sunflower");
    expect(show.getAttribute("aria-pressed")).toBe("false");
    expect(show.querySelector('[data-icon="eye-closed"]')).toBeTruthy();

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(input.getAttribute("type")).toBe("text");
    expect((input as HTMLInputElement).value).toBe("sunflower");
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    expect(hide.querySelector('[data-icon="eye-open"]')).toBeTruthy();
  });

  it("is a disabled non-submit button when its field is disabled", () => {
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <PasswordInput aria-label="Password" value="sunflower" readOnly disabled />
      </form>,
    );

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(toggle);
    expect(submit).not.toHaveBeenCalled();
  });
});
