import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// These tests change the language for real: the real provider loads a real
// catalog and the real Lingui context re-renders what is on screen.
vi.unmock("#/providers/i18n");
vi.unmock("@lingui/react");

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() } }),
  Link: ({
    to,
    search,
    children,
    className,
  }: {
    to: string;
    search?: Record<string, unknown>;
    children: ReactNode;
    className?: string;
    replace?: boolean;
  }) => {
    const query = search
      ? `?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`
      : "";
    return (
      <a href={`${to}${query}`} className={className}>
        {children}
      </a>
    );
  },
}));

vi.mock("#/components/install-app-button", () => ({
  InstallAppButton: () => <button type="button">Install CLC</button>,
}));
vi.mock("#/components/auth/use-sign-in", () => ({ useSignIn: () => mocks.signIn }));
vi.mock("#/components/use-paper-wallet-scan", () => ({
  usePaperWalletScan: () => ({
    videoRef: { current: null },
    fileInputRef: { current: null },
    error: null,
    cameraStarting: false,
    cancel: vi.fn(),
    handleFileUpload: vi.fn(),
  }),
}));
vi.mock("#/features/home/hooks/use-ip-camera", () => ({
  useIPCamera: () => ({ data: undefined }),
}));
vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  isPasskeyPlatformAvailable: () => false,
  pickPasskeyProvider: () => "google",
}));
// Uploads are offered only where the service is configured.
vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
  storageClient: () => ({ upload: vi.fn() }),
}));
vi.mock("#/lib/profile-currency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/lib/profile-currency")>()),
  resolveProfileCountry: vi.fn().mockResolvedValue("KE"),
}));

import { activateLocale } from "@clc/i18n/index";
import Cookies from "js-cookie";
import { AppI18nProvider } from "#/providers/i18n";
import { useThemeStore } from "#/providers/theme";
import { OnboardingDesk } from "./onboarding-desk";

function signInState(overrides: Record<string, unknown> = {}) {
  return {
    panelState: "idle",
    retryAction: null,
    approvalBusy: false,
    connecting: false,
    cardRead: false,
    error: null,
    passkey: { available: true, provider: "google", label: "Google" },
    nfcSupported: false,
    nfcScan: { phase: "idle", error: null, readFailed: false },
    nfcProblem: null,
    showNfc: false,
    showAdvanced: false,
    pkInput: "",
    setPkInput: vi.fn(),
    createAccountSearch: { step: "profile" },
    showScanner: false,
    encryptedPaperWallet: null,
    currentRedirect: "/wallet/send",
    openScanner: vi.fn(),
    closeScanner: vi.fn(),
    resumeScanner: vi.fn(),
    handleKeyScanned: vi.fn(),
    signInWithPasskey: vi.fn(),
    startNfc: vi.fn(),
    closeNfc: vi.fn(),
    toggleAdvanced: vi.fn(),
    handlePkSubmit: vi.fn(),
    accountNotFoundOpen: false,
    closeAccountNotFound: vi.fn(),
    routeToSignup: vi.fn(),
    onEncryptedDecrypted: vi.fn(),
    closeEncrypted: vi.fn(),
    ...overrides,
  };
}

function renderDesk(step: Parameters<typeof OnboardingDesk>[0]["step"], redirectTo?: string) {
  return render(
    <AppI18nProvider>
      <OnboardingDesk step={step} redirectTo={redirectTo} />
    </AppI18nProvider>,
  );
}

async function chooseLanguage(nativeLabel: string) {
  fireEvent.click(screen.getByRole("button", { name: /^language/i }));
  fireEvent.click(await screen.findByRole("radio", { name: nativeLabel }));
}

beforeEach(async () => {
  // The catalog and the stored choice outlive a test: one that chose French must not hand it on.
  await activateLocale("en");
  window.localStorage.clear();
  Cookies.remove("clc_locale", { path: "/" });
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  mocks.navigate.mockReset();
  mocks.signIn = signInState();
  useThemeStore.getState().setTheme("light");
});

describe("welcome", () => {
  it("keeps the six concepts under one h1, with language and theme in the header", () => {
    renderDesk("welcome");

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Cosmo-Local Credit"]);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(6);

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: /^language/i })).toBeTruthy();
    expect(within(header).getByRole("group", { name: "Theme" })).toBeTruthy();
  });

  it("carries the return destination into both ways in", () => {
    renderDesk("welcome", "/wallet/send");

    fireEvent.click(screen.getByRole("button", { name: "I already have an account" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { step: "signin", redirect: "/wallet/send" },
    });
  });

  it("sets the app's one theme preference from the header", () => {
    renderDesk("welcome");

    fireEvent.click(within(screen.getByRole("group", { name: "Theme" })).getByText("Dark"));

    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("clc.theme")).toBe("dark");
  });
});

describe("returning sign-in", () => {
  it("replaces the concepts with a brand area and a How CLC works link", () => {
    renderDesk("signin", "/wallet/send");

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Welcome back"]);
    expect(screen.queryByText("What is a voucher?")).toBeNull();
    expect(screen.queryByText("Your wallet")).toBeNull();
    expect(screen.getByRole("link", { name: "How CLC works" }).getAttribute("href")).toBe(
      "/onboarding?step=welcome&redirect=%2Fwallet%2Fsend",
    );
    expect(screen.getByRole("button", { name: /^language/i })).toBeTruthy();
  });

  it("keeps one page heading while an account awaits approval, and its Check again", () => {
    const retryAction = vi.fn();
    mocks.signIn = signInState({ panelState: "approvalPending", retryAction });
    renderDesk("signin");

    expect(
      screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent),
    ).toEqual(["Welcome back"]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Account awaiting approval" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^language/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(retryAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the header while the camera is open", () => {
    mocks.signIn = signInState({ showScanner: true });
    renderDesk("signin");

    expect(screen.getByRole("button", { name: /^language/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("lets Escape close the language list without also stopping the camera", async () => {
    const closeScanner = vi.fn();
    mocks.signIn = signInState({ showScanner: true, closeScanner });
    renderDesk("signin");

    fireEvent.click(screen.getByRole("button", { name: /^language/i }));
    fireEvent.keyDown(await screen.findByRole("radio", { name: "Français" }), { key: "Escape" });
    expect(closeScanner).not.toHaveBeenCalled();

    // Anywhere else on the page, Escape still stops the camera.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(closeScanner).toHaveBeenCalledTimes(1);
  });

  it("keeps a half-typed card password when the language changes", async () => {
    mocks.signIn = signInState({ encryptedPaperWallet: "encrypted-card" });
    renderDesk("signin");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "correct horse" } });

    await chooseLanguage("Français");

    await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
    // The same input, not a fresh one: the form was re-rendered, not remounted.
    expect(screen.getByLabelText("Mot de passe")).toBe(password);
    expect(password.value).toBe("correct horse");
  });

  it("keeps the private key typed into the advanced option when the theme changes", () => {
    mocks.signIn = signInState({ showAdvanced: true, pkInput: "0xabc" });
    renderDesk("signin");

    const key = screen.getByLabelText("Private key") as HTMLInputElement;
    fireEvent.click(within(screen.getByRole("group", { name: "Theme" })).getByText("Dark"));

    expect(screen.getByLabelText("Private key")).toBe(key);
    expect(key.value).toBe("0xabc");
  });
});

describe("setup", () => {
  it("keeps what has been typed when the language changes, and translates around it", async () => {
    renderDesk("profile");

    const name = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Wanjiru Kamau" } });
    const username = screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;
    fireEvent.change(username, { target: { value: "wanjiru" } });

    await chooseLanguage("Français");

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuer" })).toBeTruthy());
    expect(document.documentElement.lang).toBe("fr");
    // The very same inputs, still holding the values.
    expect(screen.getByRole("textbox", { name: "Nom" })).toBe(name);
    expect(name.value).toBe("Wanjiru Kamau");
    expect(screen.getByRole("textbox", { name: "Nom d’utilisateur" })).toBe(username);
    expect(username.value).toBe("wanjiru");
    // The header is where it was, now reading the new language.
    expect(
      within(screen.getByRole("banner")).getByRole("button", { name: /^langue/i }),
    ).toBeTruthy();
  });

  it("has one page title and the header controls on every setup page", () => {
    renderDesk("profile");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: /^language/i })).toBeTruthy();
    expect(within(header).getByRole("group", { name: "Theme" })).toBeTruthy();
  });
});
