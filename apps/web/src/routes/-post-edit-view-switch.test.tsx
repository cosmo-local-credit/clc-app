import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Editing a post across a browser zoom or window resize that crosses the
 * desktop breakpoint. The real `LayoutSwitch` swaps the phone editor for the
 * desktop one; both run `usePostEditorForm`, so what was written has to
 * survive the swap, and only what was written: the photos and attachments
 * return to the saved post's.
 */
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updatePost: vi.fn(),
  account: { address: undefined as string | undefined },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => true,
  useSearch: () => ({}),
  useBlocker: () => ({ status: "idle", reset: vi.fn(), proceed: vi.fn() }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: Boolean(mocks.account.address),
    isLoading: false,
    address: mocks.account.address,
    session: undefined,
  }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/posts/hooks/use-my-posts", () => ({
  useMyPost: () => ({ data: saved(), isPending: false, isError: false, refetch: vi.fn() }),
  useMyPosts: () => ({ data: undefined, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("#/features/posts/hooks/use-post-mutations", () => ({
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePost: () => ({ mutateAsync: mocks.updatePost, isPending: false }),
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
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

import { LayoutSwitch } from "#/desktop/switch";
import { DESKTOP_MEDIA } from "#/desktop/layout";
import { PostEditorDesk } from "#/desktop/posts/post-editor-desk";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const ALICE = "0xAbC0000000000000000000000000000000000123";
const BOB = "0xB0b0000000000000000000000000000000000456";

function saved(): ManagedReportDetail {
  return {
    id: "4633",
    title: "August community harvest",
    description: "Summary",
    body: "",
    imageUrl: null,
    locationName: null,
    lat: null,
    lng: null,
    periodFrom: null,
    periodTo: null,
    authorAddress: ALICE,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    markerIcon: "post",
    markerColor: "pink",
    tags: [],
    vouchers: [
      {
        id: "1",
        chainId: 42220,
        address: "0x1111111111111111111111111111111111111111",
        name: "Priscilah Malii",
        symbol: "MALII",
      },
    ],
    pools: [],
    images: [],
    attachments: [
      {
        kind: "FILE",
        url: "https://content.example/notes.pdf",
        filename: "notes.pdf",
        byteSize: 81_920,
      },
    ],
    hostName: "Wendo Group",
    participants: null,
    timeTaken: null,
    status: "SUBMITTED",
  };
}

const originalMatchMedia = window.matchMedia;
const media = { matches: false, listeners: new Set<() => void>() };

function setViewport(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}

function openViewport(desktop: boolean) {
  media.matches = desktop;
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
}

function editor() {
  return (
    <LayoutSwitch
      mobile={<PostEditorPage mode="edit" reportId="4633" />}
      desktop={<PostEditorDesk mode="edit" reportId="4633" />}
    />
  );
}

const entries = () => useViewDraftStore.getState().entries;
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const change = (label: string, next: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: next } });

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  mocks.account.address = ALICE;
  mocks.updatePost.mockResolvedValue(saved());
  clearViewDrafts();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
  clearViewDrafts();
});

describe("Edit post across a phone/desktop view switch", () => {
  it("brings what was written to the other view and back, and the form is dirty again", async () => {
    render(editor());
    expect(value("Title")).toBe("August community harvest");
    change("Title", "August harvest, week two");
    change("Host", "Wendo Group and friends");

    setViewport(true);

    await waitFor(() => expect(value("Title")).toBe("August harvest, week two"));
    expect(value("Host")).toBe("Wendo Group and friends");
    // The saved attachment is the post's own; a swap neither drops nor replaces it.
    expect(value("Link 1")).toBe("https://content.example/notes.pdf");
    // Restored edits are unsaved edits: the browser still asks before the tab goes.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    change("Title", "August harvest, week three");
    setViewport(false);
    await waitFor(() => expect(value("Title")).toBe("August harvest, week three"));
    expect(Object.keys(entries())).toEqual([`${ALICE.toLowerCase()}:post-edit:4633`]);
  });

  it("keeps completed media descriptors alongside the written fields", () => {
    render(editor());
    change("Title", "August harvest, week two");

    const [stored] = Object.values(entries());
    expect(stored.value).toMatchObject({
      title: "August harvest, week two",
      images: [],
      imageUrl: null,
      attachments: saved().attachments,
    });
    expect(JSON.stringify(entries())).not.toMatch(/blob:|data:/);
  });

  it("keeps nothing while the post is as saved, or once it is back to that", async () => {
    render(editor());
    expect(entries()).toEqual({});

    change("Title", "Changed");
    expect(Object.keys(entries())).toHaveLength(1);
    change("Title", "August community harvest");
    expect(entries()).toEqual({});

    // The same after a restore: undoing everything forgets the draft.
    change("Title", "Changed again");
    setViewport(true);
    await waitFor(() => expect(value("Title")).toBe("Changed again"));
    change("Title", "August community harvest");
    expect(entries()).toEqual({});
  });

  it("does not bring the edit back after the person leaves and returns in the other layout", () => {
    openViewport(false);
    const first = render(editor());
    change("Title", "Abandoned edit");

    first.unmount();
    expect(entries()).toEqual({});
    openViewport(true);
    render(editor());

    expect(value("Title")).toBe("August community harvest");
  });

  it("is scoped to the account, and absent for a guest", async () => {
    render(editor());
    change("Title", "Alice's edit");

    mocks.account.address = BOB;
    setViewport(true);
    await waitFor(() => expect(value("Title")).toBe("August community harvest"));

    mocks.account.address = undefined;
    setViewport(false);
    await waitFor(() => expect(value("Title")).toBe("August community harvest"));
    change("Title", "Typed signed out");
    expect(Object.keys(entries()).every((key) => key.startsWith(ALICE.toLowerCase()))).toBe(true);
  });

  it("forgets the draft once the edit is saved", async () => {
    render(editor());
    change("Title", "August harvest, week two");
    expect(Object.keys(entries())).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
    expect(entries()).toEqual({});
  });
});
