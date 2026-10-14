import { activateLocale } from "@clc/i18n/index";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Cookies from "js-cookie";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { InstallAppButton } from "#/components/install-app-button";
import { AppI18nProvider } from "#/providers/i18n";
import { useInstallStore } from "./install-store";

// These regressions must exercise real catalog loading and React subscription,
// rather than the English-only Lingui/provider doubles in the general setup.
vi.unmock("@lingui/react");
vi.unmock("#/providers/i18n");

beforeEach(async () => {
  useInstallStore.setState(useInstallStore.getInitialState(), true);
  localStorage.clear();
  Cookies.remove("clc_locale", { path: "/" });
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
  );
  await activateLocale("en");
});

afterEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  Cookies.remove("clc_locale", { path: "/" });
  await activateLocale("en");
});

async function chooseLanguage(name: string) {
  const option = (await screen.findByText(name)).closest('[role="option"]');
  if (!option) throw new Error(`${name} is not offered as a language option`);
  // Base UI distinguishes touch from a mouse click on an unhighlighted item.
  const pointer = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(pointer, "pointerType", { value: "touch" });
  fireEvent(option, pointer);
  fireEvent.click(option);
}

it("changes every iPhone install step when the open dialog's language changes", async () => {
  render(
    <AppI18nProvider>
      <InstallAppButton />
    </AppI18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Choose Add to Home Screen.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("combobox"));
  await chooseLanguage("Српски");
  expect(await within(dialog).findByRole("heading", { name: "Инсталирај CLC" })).toBeTruthy();
  expect(within(dialog).getByText(/Изаберите.*Додај на почетни екран/)).toBeTruthy();
  expect(within(dialog).queryByText("Choose Add to Home Screen.")).toBeNull();
  fireEvent.click(within(dialog).getByRole("combobox"));
  await chooseLanguage("Kiswahili");
  expect(await within(dialog).findByRole("heading", { name: "Sakinisha CLC" })).toBeTruthy();
  expect(within(dialog).getByText(/Chagua.*Ongeza kwenye/)).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Endelea kwenye kivinjari" })).toBeTruthy();
  expect(navigator.language).toBe("en-US");
}, 10_000);

it("keeps the native event available through a language change", async () => {
  let choose!: (choice: { outcome: "dismissed"; platform: string }) => void;
  const userChoice = new Promise<{ outcome: "dismissed"; platform: string }>((resolve) => {
    choose = resolve;
  });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice,
    platforms: ["web"],
  });
  useInstallStore.setState({ promptEvent: event });
  localStorage.setItem("clc.locale", "sw");
  render(
    <AppI18nProvider>
      <InstallAppButton />
    </AppI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Sakinisha CLC" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Sakinisha sasa" })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("combobox"));
  await chooseLanguage("Српски");
  const install = await within(dialog).findByRole("button", { name: "Инсталирај сада" });
  expect(useInstallStore.getState().promptEvent).toBe(event);
  fireEvent.click(install);
  expect(prompt).toHaveBeenCalledTimes(1);
  await act(async () => {
    choose({ outcome: "dismissed", platform: "web" });
  });
  expect(within(dialog).queryByRole("button", { name: "Инсталирај сада" })).toBeNull();
});
