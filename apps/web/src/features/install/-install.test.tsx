import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { InstallAppLink } from "#/components/install-app-link";
import { Route as InstallRoute } from "#/routes/install";
import { initializeInstallEvents, useInstallStore } from "./install-store";

import { installBootstrapScript, type InstallPromptEvent } from "./install-bootstrap";
import { createInstallDialog } from "./install-dialog";
import { InstallAppButton } from "#/components/install-app-button";

vi.mock("#/components/language-selector", () => ({ LanguageSelector: () => null }));

// A browser event can precede React. Run the actual inline bootstrap once for
// this document, then reset its snapshot between tests without adding listeners.
window.eval(installBootstrapScript);

const fake = vi.hoisted(() => ({ ready: Promise.resolve(true), available: true, show: vi.fn() }));
vi.mock("@khmyznikov/pwa-install", () => {
  class FakeInstallElement extends HTMLElement {
    externalPromptEvent: InstallPromptEvent | null = null;
    manualApple = false;
    manualChrome = false;
    manifestUrl = "";
    isDialogHidden = true;
    isInstallAvailable = fake.available;
    isAppleMobilePlatform = false;
    isAppleDesktopPlatform = false;
    isAndroid = false;
    updateComplete = fake.ready;
    showDialog() {
      fake.show();
      this.isDialogHidden = false;
      const button = document.createElement("button");
      button.textContent = "Confirm installation";
      button.onclick = async () => {
        const event = this.externalPromptEvent;
        if (!event || button.disabled) return;
        button.disabled = true;
        this.hideDialog();
        this.dispatchEvent(
          new CustomEvent("pwa-install-backend-event", {
            detail: { backend: "beforeinstallprompt" },
          }),
        );
        try {
          await event.prompt();
          const { outcome } = await event.userChoice;
          this.dispatchEvent(
            new CustomEvent("pwa-user-choice-result-event", { detail: { message: outcome } }),
          );
        } catch {
          this.dispatchEvent(
            new CustomEvent("pwa-install-fail-event", { detail: { fallbackAvailable: false } }),
          );
        }
      };
      this.replaceChildren(button);
    }
    hideDialog() {
      this.isDialogHidden = true;
      this.replaceChildren();
    }
  }
  customElements.define("pwa-install", FakeInstallElement);
  return { PWAInstallElement: FakeInstallElement };
});

let dispose: (() => void) | undefined;

beforeEach(() => {
  useInstallStore.setState(useInstallStore.getInitialState(), true);
  Object.assign(window.__clcInstall!, useInstallStore.getInitialState());
  fake.ready = Promise.resolve(true);
  fake.available = true;
  fake.show.mockClear();
  Object.defineProperties(navigator, {
    clipboard: { configurable: true, get: () => undefined },
    share: { configurable: true, get: () => undefined },
    standalone: { configurable: true, get: () => false },
    maxTouchPoints: { configurable: true, get: () => 0 },
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

function startBrowser(
  userAgent = "Mozilla/5.0 (Linux; Android 15) Chrome/140.0.0.0 Mobile Safari/537.36",
) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  dispose = initializeInstallEvents();
}

function offerInstall() {
  let choose!: (choice: { outcome: "accepted" | "dismissed" }) => void;
  const userChoice = new Promise<{ outcome: "accepted" | "dismissed" }>((resolve) => {
    choose = resolve;
  });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    platforms: ["web"],
    userChoice: userChoice.then((choice) => ({ ...choice, platform: "web" })),
  }) as InstallPromptEvent;
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, choose, event };
}

async function renderPage(initialEntries = ["/install"]) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <>
        <p>Home screen</p>
        <InstallAppLink />
      </>
    ),
  });
  const install = createRoute({
    getParentRoute: () => root,
    path: "/install",
    component: InstallRoute.options.component,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, install]),
    history: createMemoryHistory({ initialEntries }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "CLC on your home screen" });
  return router;
}

describe("CLC installation", () => {
  it("keeps translated help and browser navigation available without a native event", async () => {
    startBrowser();
    await renderPage();
    expect(screen.getByText(/Use your browser's menu/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install CLC" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue in browser" })).toBeTruthy();
    expect(document.querySelector("pwa-install")).toBeNull();
  });

  it("captures before hydration and passes the event as a property only after a tap", async () => {
    const { event, prompt, choose } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallStore.getState().promptEvent).toBeNull();
    startBrowser();
    expect(useInstallStore.getState().promptEvent).toBe(event);
    await renderPage(["/?tab=settings", "/install"]);
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    const confirm = await screen.findByRole("button", { name: "Confirm installation" });
    const dialog = document.querySelector("pwa-install")!;
    expect(dialog).toHaveProperty("externalPromptEvent", event);
    expect(dialog.getAttribute("externalPromptEvent")).toBeNull();
    expect(dialog).toHaveProperty("manualApple", true);
    expect(dialog).toHaveProperty("manualChrome", true);
    expect(prompt).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(useInstallStore.getState().promptEvent).toBeNull();
    expect(window.__clcInstall!.promptEvent).toBeNull();
    await act(async () => {
      choose({ outcome: "accepted" });
    });
    expect(screen.getByText(/Installation requested/)).toBeTruthy();
    expect(screen.queryByText(/CLC is installed/)).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.getByText(/CLC is installed/)).toBeTruthy();
  });

  it("forwards events arriving after dialog loading and prevents duplicate sheets", async () => {
    startBrowser();
    await renderPage();
    const button = screen.getByRole("button", { name: "Install CLC" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Confirm installation" });
    const { event } = offerInstall();
    expect(document.querySelector("pwa-install")).toHaveProperty("externalPromptEvent", event);
    fireEvent.click(button);
    expect(fake.show).toHaveBeenCalledTimes(1);
  });

  it("waits for initialization before opening and disposes on navigation", async () => {
    let ready!: (value: boolean) => void;
    fake.ready = new Promise((resolve) => {
      ready = resolve;
    });
    startBrowser();
    const router = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    await waitFor(() => expect(document.querySelector("pwa-install")).not.toBeNull());
    expect(fake.show).not.toHaveBeenCalled();
    await act(async () => {
      await router.navigate({ to: "/" });
    });
    await act(async () => {
      ready(true);
    });
    expect(fake.show).not.toHaveBeenCalled();
    expect(document.querySelector("pwa-install")).toBeNull();
  });

  it("clears a dismissed native event and accepts a fresh event", async () => {
    startBrowser();
    const first = offerInstall();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm installation" }));
    await act(async () => {
      first.choose({ outcome: "dismissed" });
    });
    expect(screen.getByText(/Installation cancelled/)).toBeTruthy();
    expect(window.__clcInstall!.promptEvent).toBeNull();
    const second = offerInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm installation" }));
    expect(second.prompt).toHaveBeenCalledTimes(1);
    expect(first.prompt).toHaveBeenCalledTimes(1);
  });

  it("does not consume the native event when merely closing the custom sheet", async () => {
    startBrowser();
    const { event, prompt } = offerInstall();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    await screen.findByRole("button", { name: "Confirm installation" });
    act(() => {
      document
        .querySelector("pwa-install")!
        .dispatchEvent(
          new CustomEvent("pwa-user-choice-result-event", { detail: { message: "dismissed" } }),
        );
    });
    expect(useInstallStore.getState().promptEvent).toBe(event);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("keeps fallback help usable if the dialog cannot initialize", async () => {
    fake.available = false;
    startBrowser();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Use your browser's menu/)).toBeTruthy();
    expect(document.querySelector("pwa-install")).toBeNull();
  });

  it("clears a failed native prompt and shows fallback help", async () => {
    startBrowser();
    const { prompt } = offerInstall();
    prompt.mockRejectedValue(new Error("Prompt unavailable"));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm installation" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.__clcInstall!.promptEvent).toBeNull();
  });

  it("opens directly from the onboarding CTA", async () => {
    startBrowser();
    render(<InstallAppButton />);
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    await screen.findByRole("button", { name: "Confirm installation" });
    expect(fake.show).toHaveBeenCalledTimes(1);
  });

  it("stops React synchronization on cleanup but keeps capturing for the document", () => {
    startBrowser();
    dispose?.();
    const { event } = offerInstall();
    expect(useInstallStore.getState().promptEvent).toBeNull();
    expect(window.__clcInstall!.promptEvent).toBe(event);
  });

  it("does not open when already installed", async () => {
    startBrowser();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    const controller = createInstallDialog();
    await controller.open();
    expect(document.querySelector("pwa-install")).toBeNull();
    controller.dispose();
  });

  it("preserves the originating tab when going Back", async () => {
    startBrowser();
    const router = await renderPage(["/?tab=settings", "/install"]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Home screen");
    expect(router.state.location.searchStr).toBe("?tab=settings");
    fireEvent.click(screen.getByRole("link", { name: "Install CLC" }));
    await screen.findByRole("heading", { name: "CLC on your home screen" });
    act(() => {
      router.history.back();
    });
    await screen.findByText("Home screen");
  });

  it("returns direct visitors to Market", async () => {
    startBrowser();
    const router = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Home screen");
    expect(router.state.location.searchStr).toBe("?tab=market");
  });

  it("copies a clean installation URL when native sharing is unavailable", async () => {
    startBrowser();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    await renderPage(["/install?w=private-wallet-key#private-fragment"]);
    fireEvent.click(screen.getByRole("button", { name: "Share installation link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/install`),
    );
    expect(await screen.findByText("Link copied. Paste it into a message.")).toBeTruthy();
  });

  it("shows a selectable link when clipboard access fails", async () => {
    startBrowser();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Share installation link" }));
    expect(await screen.findByText("Select and copy the link above to share it.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Installation link" })).toHaveProperty(
      "value",
      `${window.location.origin}/install`,
    );
  });

  it("shares the installation link through the phone's share sheet", async () => {
    startBrowser();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Share installation link" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Install CLC",
        url: `${window.location.origin}/install`,
      }),
    );
  });

  it("does not copy anything when the user cancels sharing", async () => {
    startBrowser();
    const writeText = vi.fn();
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")),
    });
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share installation link" }));
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Select and copy the link above to share it.")).toBeNull();
  });

  it("recognizes an installed iPhone app and offers sharing instead of installation", async () => {
    vi.spyOn(
      navigator as Navigator & { standalone?: boolean },
      "standalone",
      "get",
    ).mockReturnValue(true);
    startBrowser("iPhone Safari/604.1");
    const { prompt } = offerInstall();
    await renderPage();
    expect(screen.getByText(/CLC is installed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install CLC" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Continue to CLC" }));
    await screen.findByText("Home screen");
    expect(screen.queryByRole("link", { name: "Install CLC" })).toBeNull();
    expect(screen.getByRole("link", { name: "Share CLC" })).toBeTruthy();
    expect(prompt).not.toHaveBeenCalled();
  });
});
