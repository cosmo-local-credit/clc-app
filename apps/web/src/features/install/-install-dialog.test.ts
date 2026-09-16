import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { waitFor } from "@testing-library/react";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import { installBootstrapScript } from "./install-bootstrap";
import { createInstallDialog } from "./install-dialog";
import { initializeInstallEvents, useInstallStore } from "./install-store";

// Exercise the installed package as well as our adapter. Native browser/OS
// installation is the only mocked boundary; Lit initialization is real.
window.eval(installBootstrapScript);
let disposeStore: () => void;
let controller: ReturnType<typeof createInstallDialog>;

beforeEach(() => {
  useInstallStore.setState(useInstallStore.getInitialState(), true);
  Object.assign(window.__clcInstall!, useInstallStore.getInitialState());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  vi.stubGlobal("CSS", { supports: () => false });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "/",
        short_name: "CLC",
        name: "Cosmo-Local Credit",
        icons: [{ src: "/logo192.png", sizes: "192x192", type: "image/png" }],
      }),
    }),
  );
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Linux; Android 15) Chrome/140.0.0.0 Mobile Safari/537.36",
  );
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/manifest.json";
  document.head.append(manifest);
  disposeStore = initializeInstallEvents();
  controller = createInstallDialog();
});

afterEach(() => {
  controller.dispose();
  disposeStore();
  document.querySelector('link[rel="manifest"]')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("initializes the real dialog and consumes the retained event once", async () => {
  let choose!: (choice: { outcome: "dismissed"; platform: string }) => void;
  const userChoice = new Promise<{ outcome: "dismissed"; platform: string }>((resolve) => {
    choose = resolve;
  });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice,
    platforms: ["web"],
  });
  window.dispatchEvent(event);
  await controller.open();
  const dialog = document.querySelector("pwa-install") as PWAInstallElement;
  expect(dialog.externalPromptEvent).toBe(event);
  expect(dialog.isDialogHidden).toBe(false);
  expect(dialog.isInstallAvailable).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  const attempt = dialog.install();
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(window.__clcInstall!.promptEvent).toBeNull();
  choose({ outcome: "dismissed", platform: "web" });
  await attempt;
  expect(useInstallStore.getState().status).toBe("dismissed");
  expect(useInstallStore.getState().installed).toBe(false);
});

it("opens real iPhone instructions without a beforeinstallprompt event", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
  );
  await controller.open();
  const dialog = document.querySelector("pwa-install") as PWAInstallElement;
  expect(dialog.isAppleMobilePlatform).toBe(true);
  await waitFor(() => expect(dialog.isInstallAvailable).toBe(true));
  await dialog.updateComplete;
  expect(dialog.isDialogHidden).toBe(false);
  expect(dialog.shadowRoot?.textContent).toContain("CLC");
});
