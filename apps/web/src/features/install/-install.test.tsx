import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { InstallAppLink } from "#/components/install-app-link";
import { Route as InstallRoute } from "#/routes/install";
import { initializeInstallEvents, useInstallStore } from "./install-store";

import { installBootstrapScript, type InstallPromptEvent } from "./install-bootstrap";
import { InstallAppButton } from "#/components/install-app-button";

vi.mock("#/components/language-selector", () => ({ LanguageSelector: () => null }));

// A browser event can precede React. Run the actual inline bootstrap once for
// this document, then reset its snapshot between tests without adding listeners.
window.eval(installBootstrapScript);

let dispose: (() => void) | undefined;

beforeEach(() => {
  useInstallStore.setState(useInstallStore.getInitialState(), true);
  Object.assign(window.__clcInstall!, useInstallStore.getInitialState());
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
  it("keeps instructions and browser navigation available without a native event", async () => {
    startBrowser();
    await renderPage();
    expect(screen.getByText("Open this page in Chrome.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install CLC" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue in browser" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("captures before hydration and prompts only once from the dialog button", async () => {
    const { event, prompt, choose } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallStore.getState().promptEvent).toBeNull();
    startBrowser();
    expect(useInstallStore.getState().promptEvent).toBe(event);
    await renderPage(["/?tab=settings", "/install"]);
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    const confirm = await screen.findByRole("button", { name: "Install now" });
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

  it("offers a newly available prompt without opening duplicate sheets", async () => {
    startBrowser();
    await renderPage();
    const button = screen.getByRole("button", { name: "Install CLC" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Install now" })).toBeNull();
    const { prompt } = offerInstall();
    fireEvent.click(await screen.findByRole("button", { name: "Install now" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("removes the sheet on navigation", async () => {
    startBrowser();
    const router = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    await screen.findByRole("dialog");
    await act(async () => {
      await router.navigate({ to: "/" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears a dismissed native event and accepts a fresh event", async () => {
    startBrowser();
    const first = offerInstall();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Install now" }));
    await act(async () => {
      first.choose({ outcome: "dismissed" });
    });
    expect(window.__clcInstall!.promptEvent).toBeNull();
    expect(screen.queryByRole("button", { name: "Install now" })).toBeNull();
    const second = offerInstall();
    fireEvent.click(await screen.findByRole("button", { name: "Install now" }));
    expect(second.prompt).toHaveBeenCalledTimes(1);
    expect(first.prompt).toHaveBeenCalledTimes(1);
  });

  it("keeps the native event when only the custom sheet is closed", async () => {
    startBrowser();
    const { event, prompt } = offerInstall();
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Continue in browser" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useInstallStore.getState().promptEvent).toBe(event);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("clears a failed native prompt and shows instructions in the sheet", async () => {
    startBrowser();
    const { prompt } = offerInstall();
    prompt.mockRejectedValue(new Error("Prompt unavailable"));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Install now" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("Open this page in Chrome.")).toBeTruthy();
    expect(window.__clcInstall!.promptEvent).toBeNull();
  });

  it("opens directly from the onboarding CTA", async () => {
    startBrowser();
    render(<InstallAppButton />);
    fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("stops React synchronization on cleanup but keeps capturing for the document", () => {
    startBrowser();
    dispose?.();
    const { event } = offerInstall();
    expect(useInstallStore.getState().promptEvent).toBeNull();
    expect(window.__clcInstall!.promptEvent).toBe(event);
  });

  it("does not offer installation when already installed", () => {
    startBrowser();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: "Install CLC" })).toBeNull();
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
    expect(await screen.findByText("Link copied")).toBeTruthy();
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
