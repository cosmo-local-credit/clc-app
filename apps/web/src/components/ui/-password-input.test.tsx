import { activateLocale, i18n } from "@clc/i18n/index";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PasswordInput } from "./password-input";

vi.unmock("@lingui/react");

beforeEach(async () => activateLocale("en"));

function renderPasswordInput(props: Partial<ComponentProps<typeof PasswordInput>> = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <PasswordInput aria-label="Password" value="sunflower" readOnly {...props} />
    </I18nProvider>,
  );
}

describe("PasswordInput", () => {
  it("reveals and conceals the unchanged value with current-state icons", () => {
    renderPasswordInput();
    const input = screen.getByLabelText("Password");
    const show = screen.getByRole("button", { name: "Show password" });

    expect(input.getAttribute("type")).toBe("password");
    expect((input as HTMLInputElement).value).toBe("sunflower");
    expect(show.getAttribute("aria-pressed")).toBe("false");
    expect(show.getAttribute("title")).toBe("Show password");
    expect(show.querySelector('[data-icon="eye-closed"]')).toBeTruthy();

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(input.getAttribute("type")).toBe("text");
    expect((input as HTMLInputElement).value).toBe("sunflower");
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    expect(hide.getAttribute("title")).toBe("Hide password");
    expect(hide.querySelector('[data-icon="eye-open"]')).toBeTruthy();

    fireEvent.click(hide);
    expect(input.getAttribute("type")).toBe("password");
  });

  it("never submits its surrounding form", () => {
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <I18nProvider i18n={i18n}>
        <form onSubmit={submit}>
          <PasswordInput aria-label="Password" value="sunflower" readOnly />
        </form>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps two fields independently revealable", () => {
    render(
      <I18nProvider i18n={i18n}>
        <PasswordInput aria-label="Password" value="sunflower" readOnly />
        <PasswordInput aria-label="Confirm password" value="sunflower" readOnly />
      </I18nProvider>,
    );
    const toggles = screen.getAllByRole("button", { name: "Show password" });

    fireEvent.click(toggles[0]);
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Confirm password").getAttribute("type")).toBe("password");
  });

  it("supports contextual labels", () => {
    renderPasswordInput({ showLabel: "Show private key", hideLabel: "Hide private key" });

    fireEvent.click(screen.getByRole("button", { name: "Show private key" }));
    expect(screen.getByRole("button", { name: "Hide private key" })).toBeTruthy();
  });

  it("localizes the action and keeps it at the logical inline end", async () => {
    await activateLocale("ar");
    renderPasswordInput();

    const toggle = screen.getByRole("button", { name: "إظهار كلمة المرور" });
    expect(toggle.className).toContain("end-0");
  });

  it("disables the toggle with the field", () => {
    renderPasswordInput({
      disabled: true,
    });

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
  });
});
