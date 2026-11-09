import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { IntroductionProvider, IntroductionReplayButton } from "./introduction-provider";

const mock = vi.hoisted(() => ({
  auth: {
    state: "guest",
    isLoading: false,
    isAuthenticated: false,
    address: undefined as string | undefined,
  },
  location: {
    pathname: "/onboarding",
    search: { step: "welcome", redirect: "/wallet/send" },
    hash: "",
  },
  seen: false,
  navigate: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mock.auth }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mock.navigate,
  useRouterState: () => mock.location,
}));
vi.mock("./introduction-state", async (original) => ({
  ...(await original<typeof import("./introduction-state")>()),
  hasSeenIntroduction: () => mock.seen,
  completeIntroduction: () => {
    mock.complete();
    mock.seen = true;
  },
}));
vi.mock("#/features/onboarding/ui/landing-page", () => ({
  LandingPage: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="welcome">
      <button onClick={onComplete}>Market</button>
    </div>
  ),
}));
vi.mock("./introduction", () => ({
  Introduction: ({ onDone }: { onDone: () => void }) => (
    <div data-testid="intro">
      Replay
      <button onClick={onDone}>Close replay</button>
    </div>
  ),
}));
beforeEach(() => {
  mock.seen = false;
  mock.auth = { state: "guest", isLoading: false, isAuthenticated: false, address: undefined };
  mock.navigate.mockReset();
  mock.complete.mockReset();
});
function App() {
  return (
    <IntroductionProvider>
      <p>App content</p>
      <IntroductionReplayButton />
    </IntroductionProvider>
  );
}

it("shows the welcome screen with inline guidance on first entry", async () => {
  render(<App />);
  expect(await screen.findByTestId("welcome")).toBeTruthy();
  expect(screen.queryByTestId("intro")).toBeNull();
});

it("waits for auth and never interrupts a returning wallet, including after sign-out", async () => {
  mock.auth.state = "loading";
  mock.auth.isLoading = true;
  const view = render(<App />);
  expect(screen.queryByTestId("intro")).toBeNull();
  mock.auth = { state: "authenticated", isAuthenticated: true, isLoading: false, address: "0x123" };
  view.rerender(<App />);
  expect(screen.queryByTestId("intro")).toBeNull();
  expect(mock.complete).toHaveBeenCalled();
  mock.auth = { state: "guest", isAuthenticated: false, isLoading: false, address: undefined };
  view.rerender(<App />);
  expect(screen.queryByTestId("intro")).toBeNull();
});

it("allows manual replay without sending the member to registration", async () => {
  mock.seen = true;
  render(<App />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("Replay");
  fireEvent.click(screen.getByText("Close replay"));
  expect(mock.navigate).not.toHaveBeenCalled();
  expect(screen.queryByTestId("intro")).toBeNull();
});

it("honors completion from another tab", async () => {
  render(<App />);
  await screen.findByTestId("welcome");
  mock.seen = true;
  await act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "clc.introduction.v1", newValue: "done" }),
    ),
  );
  await waitFor(() => expect(screen.queryByTestId("welcome")).toBeNull());
});

it("releases the route immediately when a guest chooses Market", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Market" }));
  expect(screen.getByText("App content")).toBeTruthy();
  expect(screen.queryByTestId("welcome")).toBeNull();
});

it("skips the carousel on desktop and replays the guide over the page, signed in or not", async () => {
  // /onboarding sends a signed-in member straight back out, so replay must not
  // navigate there: the guide opens over the page instead.
  render(
    <IntroductionProvider
      desktop
      desktopGuide={({ onDone }) => (
        <div role="dialog" aria-label="Guide">
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
      )}
    >
      <p>App content</p>
      <IntroductionReplayButton />
    </IntroductionProvider>,
  );
  expect(await screen.findByText("App content")).toBeTruthy();
  expect(screen.queryByTestId("welcome")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "How to use CLC" }));

  expect(screen.getByRole("dialog", { name: "Guide" })).toBeTruthy();
  expect(screen.getByText("App content")).toBeTruthy();
  expect(mock.navigate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog", { name: "Guide" })).toBeNull();
});
