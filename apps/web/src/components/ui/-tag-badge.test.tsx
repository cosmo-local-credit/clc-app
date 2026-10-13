import { activateLocale, i18n } from "@clc/i18n/index";
import { LOCALE_OPTIONS } from "@clc/i18n/locales";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { categoryLabel } from "#/lib/category-label";
import { SelectableTagBadge, TagBadge } from "./tag-badge";

vi.unmock("@lingui/react");

afterEach(async () => activateLocale("en"));

it("updates category labels on language change while retaining the filter value", async () => {
  await activateLocale("en");
  const select = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <SelectableTagBadge tag="Handmade" selected count={3} onClick={() => select("Handmade")} />
      <TagBadge tag="Culture" />
      <TagBadge tag="Our local group" />
    </I18nProvider>,
  );
  const button = screen.getByRole("button", { name: "Handmade3" });
  const color = button.style.backgroundColor;
  await act(async () => activateLocale("sr"));
  expect(screen.getByText("Култура")).toBeTruthy();
  const translated = screen.getByRole("button", { name: "Ручни рад3" });
  expect(translated.getAttribute("aria-pressed")).toBe("true");
  expect(translated.style.backgroundColor).toBe(color);
  fireEvent.click(translated);
  expect(select).toHaveBeenCalledWith("Handmade");
  expect(screen.getByText("Our local group")).toBeTruthy();
  await act(async () => activateLocale("de"));
  expect(screen.getByRole("button", { name: "Handgemacht3" })).toBeTruthy();
  expect(screen.getByText("Kultur")).toBeTruthy();
});

it.each(LOCALE_OPTIONS)("has category translations in $code", async ({ code }) => {
  await activateLocale(code);
  expect(categoryLabel("Handmade", i18n)).not.toBe("");
  if (code !== "en") expect(categoryLabel("Handmade", i18n)).not.toBe("Handmade");
  expect(categoryLabel("Culture", i18n)).not.toBe("");
  expect(categoryLabel("Custom / category", i18n)).toBe("Custom / category");
  expect(categoryLabel("constructor", i18n)).toBe("constructor");
});
