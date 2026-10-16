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
  LandingPage: () => <div data-testid="welcome">Welcome with inline introduction</div>,
}));
vi.mock("./introduction", () => ({
  Introduction: ({ replay, onExit }: { replay: boolean; onExit: (value: string) => void }) => (
    <div data-testid="intro">
      {replay ? "Replay" : "First visit"}
      <button onClick={() => onExit("skip")}>Skip intro</button>
      <button onClick={() => onExit("create")}>Finish intro</button>
      <button onClick={() => onExit("signin")}>Sign in directly</button>
      <button onClick={() => onExit("done")}>Close replay</button>
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
