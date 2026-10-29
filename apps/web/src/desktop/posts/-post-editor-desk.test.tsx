import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  blocker: { status: "idle" as "idle" | "blocked", reset: vi.fn(), proceed: vi.fn() },
  auth: {
    isAuthenticated: true,
    isLoading: false,
    address: "0xAbC0000000000000000000000000000000000123",
    session: undefined as { address: string; chainId: number; role?: string } | undefined,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => true,
  useSearch: () => ({}),
  useBlocker: () => mocks.blocker,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/posts/hooks/use-my-posts", () => ({
  useMyPost: () => ({ data: undefined, isPending: false, isError: false, refetch: vi.fn() }),
  useMyPosts: () => ({ data: undefined, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("#/features/posts/hooks/use-post-mutations", () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: ["Agriculture"], isError: false, refetch: vi.fn() }),
}));
vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string) => ({
    query,
    setQuery: vi.fn(),
    results: [],
    status: "idle",
    retry: vi.fn(),
  }),
}));
vi.mock("#/features/catalogs/hooks/use-pool-search", () => ({
  POOL_SEARCH_MIN_CHARS: 2,
  usePoolSearch: (query: string) => ({
    query,
    setQuery: vi.fn(),
    results: [],
    status: "idle",
    retry: vi.fn(),
    retrying: false,
  }),
}));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));
// The shell only defers the chunk; the editor is wanted on the first render.
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

import { PostEditorDesk } from "./post-editor-desk";

const DRAFT_KEY = "clc_post_draft_v1";

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.blocker.status = "idle";
  mocks.blocker.reset.mockReset();
  mocks.blocker.proceed.mockReset();
  window.localStorage.clear();
});

function typeTitle(value: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value } });
}

async function parkDraft(title: string) {
  const first = render(<PostEditorDesk mode="new" />);
  typeTitle(title);
  await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeTruthy(), {
    timeout: 2000,
  });
  first.unmount();
}

describe("a restored post draft", () => {
  it("says it is a draft and not published, and keeps the typed title", async () => {
    await parkDraft("Half-written");

    render(<PostEditorDesk mode="new" />);

    expect(screen.getByText("Draft restored. Not published.")).toBeTruthy();
    expect(screen.queryByText(/Picked up where you left off/)).toBeNull();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Half-written");
    expect(screen.getByRole("button", { name: "Start over" })).toBeTruthy();
  });

  it("starts over from a blank form and drops the parked draft", async () => {
    await parkDraft("Half-written");
    render(<PostEditorDesk mode="new" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    });

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByText("Draft restored. Not published.")).toBeNull();
  });

  it("shows no notice for a fresh post", () => {
    render(<PostEditorDesk mode="new" />);

    expect(screen.queryByText("Draft restored. Not published.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start over" })).toBeNull();
  });
});

describe("leaving a post with unsaved changes", () => {
  it("asks first, and Discard changes lets navigation through and drops the parked draft", async () => {
    await parkDraft("Half-written");
    mocks.blocker.status = "blocked";
    render(<PostEditorDesk mode="new" />);

    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    expect(dialog.textContent).toContain("Your unsaved changes to this post will be lost.");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(mocks.blocker.proceed).toHaveBeenCalledTimes(1);
    expect(mocks.blocker.reset).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("stays on the post when Cancel is chosen", async () => {
    mocks.blocker.status = "blocked";
    render(<PostEditorDesk mode="new" />);

    await screen.findByRole("dialog", { name: "Leave without saving?" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.blocker.reset).toHaveBeenCalledTimes(1);
    expect(mocks.blocker.proceed).not.toHaveBeenCalled();
  });
});
