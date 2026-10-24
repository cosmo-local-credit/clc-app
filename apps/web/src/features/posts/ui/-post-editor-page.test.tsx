import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { REPORT_BODY_MAX } from "@clc/core/features/reports/logic";
import { $getRoot, $selectAll, type LexicalEditor } from "lexical";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  back: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  creating: false,
  updating: false,
  detail: {
    data: undefined as ManagedReportDetail | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  profile: {
    data: undefined as
      | { name?: string; geoLat?: number | null; geoLng?: number | null }
      | undefined,
    isPending: false,
  },
  auth: {
    isAuthenticated: true,
    isLoading: false,
    address: "0xAbC0000000000000000000000000000000000123",
    session: undefined as { address: string; chainId: number; role?: string } | undefined,
  },
  voucherResults: [] as { chainId: number; address: string; name: string; symbol: string }[],
  poolResults: [] as { chainId: number; address: string; name: string; symbol: string }[],
  /** The owner the picker last asked the search to restrict itself to. */
  searchOwner: undefined as string | undefined,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.back } }),
  useCanGoBack: () => true,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => mocks.profile,
}));

vi.mock("#/features/posts/hooks/use-my-posts", () => ({
  useMyPost: () => mocks.detail,
  useMyPosts: () => ({ data: undefined, isPending: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("#/features/posts/hooks/use-post-mutations", () => ({
  useCreatePost: () => ({ mutateAsync: mocks.createPost, isPending: mocks.creating }),
  useUpdatePost: () => ({ mutateAsync: mocks.updatePost, isPending: mocks.updating }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: ["Agriculture", "Youth"], isError: false, refetch: vi.fn() }),
}));

vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string, _setQuery: unknown, _active: boolean, owner?: string) => {
    mocks.searchOwner = owner;
    return {
      query,
      setQuery: vi.fn(),
      results: mocks.voucherResults,
      status: mocks.voucherResults.length > 0 ? "ready" : "idle",
      retry: vi.fn(),
    };
  },
}));

vi.mock("#/features/catalogs/hooks/use-pool-search", () => ({
  POOL_SEARCH_MIN_CHARS: 2,
  usePoolSearch: (query: string, _setQuery: unknown, _active: boolean, owner?: string) => {
    mocks.searchOwner = owner;
    return {
      query,
      setQuery: vi.fn(),
      results: mocks.poolResults,
      status: mocks.poolResults.length > 0 ? "ready" : "idle",
      retry: vi.fn(),
      retrying: false,
    };
  },
}));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload, reset: vi.fn(), isPending: false }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

// The shell only defers the chunk. These tests want the editor inside it, and
// want it on the first render, so the rest of the form reads as it always has.
vi.mock("#/components/ui/markdown-editor", async () => {
  const editor = await import("#/components/ui/markdown-editor-lexical");
  return { MarkdownEditor: editor.MarkdownEditorLexical };
});

import { PostEditorPage } from "./post-editor-page";

function saved(overrides: Partial<ManagedReportDetail> = {}): ManagedReportDetail {
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
    authorAddress: "0xAbC0000000000000000000000000000000000123",
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
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
    attachments: [],
    hostName: null,
    participants: null,
    timeTaken: null,
    status: "SUBMITTED",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.back.mockReset();
  mocks.createPost.mockReset().mockResolvedValue(saved());
  mocks.updatePost.mockReset().mockResolvedValue(saved());
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.upload.mockReset();
  mocks.creating = false;
  mocks.updating = false;
  mocks.detail = { data: undefined, isPending: false, isError: false, refetch: vi.fn() };
  mocks.profile = { data: undefined, isPending: false };
  mocks.auth = {
    isAuthenticated: true,
    isLoading: false,
    address: "0xAbC0000000000000000000000000000000000123",
    session: undefined,
  };
  mocks.voucherResults = [];
  mocks.poolResults = [];
  mocks.searchOwner = undefined;
  window.localStorage.clear();
});

const VOUCHER = "0x1111111111111111111111111111111111111111";
const OTHER_VOUCHER = "0x2222222222222222222222222222222222222222";

function renderCreateWithVoucher() {
  return render(
    <PostEditorPage
      mode="create"
      voucher={{ chainId: 42220, address: VOUCHER, name: "Priscilah Malii" }}
    />,
  );
}

function typeTitle(value: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value } });
}

/**
 * Writes into the body and leaves it selected.
 *
 * jsdom sends no `beforeinput`, so the keystroke is applied through the editor
 * Lexical hangs off its own root element — the same handle
 * `getNearestEditorFromDOMNode` uses. The selection it leaves behind is what a
 * following toolbar press formats.
 */
async function typeBody(text: string) {
  const root = screen.getByRole("textbox", { name: "Post text" }) as HTMLElement & {
    __lexicalEditor: LexicalEditor;
  };
  await act(async () => {
    root.__lexicalEditor.update(() => {
      $getRoot().selectEnd().insertText(text);
    });
  });
  await act(async () => {
    root.__lexicalEditor.update(() => {
      $selectAll();
    });
  });
}

describe("creating a post", () => {
  it("submits with a title and a linked voucher", async () => {
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      title: "August community harvest",
      tags: [],
      images: [],
      attachments: [],
      vouchers: [{ chainId: 42220, address: VOUCHER }],
    });
  });

  it("requires at least one voucher or pool", async () => {
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Link at least one voucher or pool")).toBeTruthy();
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("refuses a blank title rather than sending it", async () => {
    renderCreateWithVoucher();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(screen.getByText("Enter a title for your post")).toBeTruthy());
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  // Posts are auto-approved, so the button and the toast say publish, not
  // submit.
  it("says the post is published and lands on My posts", async () => {
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Post published."));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/posts/mine" });
  });

  // The bytes are already stored, so a retry must not re-upload them and the
  // typed text must survive.
  it("keeps the form after a failed save", async () => {
    mocks.createPost.mockRejectedValue(new Error("Network is down"));
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Network is down"));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "August community harvest",
    );
  });

  it("disables Save while photos are uploading", async () => {
    // One upload that never settles, so the busy state is observable.
    mocks.upload.mockReturnValue(new Promise(() => {}));
    renderCreateWithVoucher();
    typeTitle("August community harvest");

    fireEvent.change(screen.getByLabelText("Add photos"), {
      target: { files: [new File(["x"], "one.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Uploading photos…" }).hasAttribute("disabled"),
      ).toBe(true),
    );
  });

  it("uses the first uploaded photo as the post cover", async () => {
    mocks.upload.mockResolvedValue({
      url: "https://content.example/first.jpg",
      width: 1440,
      height: 960,
      byteSize: 245_761,
    });
    renderCreateWithVoucher();

    fireEvent.change(screen.getByLabelText("Add photos"), {
      target: { files: [new File(["x"], "first.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByText("Cover photo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use as cover" })).toBeNull();

    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      imageUrl: "https://content.example/first.jpg",
      images: [expect.objectContaining({ url: "https://content.example/first.jpg" })],
    });
  });

  // Formatting is applied, not typed, so there is nothing to preview and no
  // Markdown cheat sheet to read.
  it("writes the body through the editor instead of a markdown textarea", async () => {
    renderCreateWithVoucher();

    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByText(/Markdown: \*\*bold\*\*/)).toBeNull();

    const body = screen.getByRole("textbox", { name: "Post text" });
    await typeBody("What happened");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Heading" }));
    });

    expect(body.querySelector("h2")?.textContent).toBe("What happened");
  });

  it("submits the body as markdown", async () => {
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    await typeBody("It went well");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({ body: "**It went well**" });
  });

  it("warns before abandoning a dirty form and only then goes back", () => {
    render(<PostEditorPage mode="create" />);
    typeTitle("Half-written");

    fireEvent.click(screen.getByRole("button", { name: /My posts/ }));

    expect(mocks.back).not.toHaveBeenCalled();
    expect(screen.getByText("Leave without saving?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  // Opened from a voucher screen: the voucher arrives linked, by name, and the
  // seed is not an edit — a form that only carries it is not dirty.
  it("starts linked to a voucher carried in from its own screen", async () => {
    render(
      <PostEditorPage
        mode="create"
        voucher={{ chainId: 42220, address: VOUCHER, name: "Priscilah Malii" }}
      />,
    );

    // Named in the picker, and named again on the chevron that goes back to it.
    expect(screen.getByRole("button", { name: `Unlink Priscilah Malii` })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Priscilah Malii/ }).getAttribute("href")).toBe(
      `/vouchers/${VOUCHER}`,
    );

    typeTitle("Harvest at the shop");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      title: "Harvest at the shop",
      vouchers: [{ chainId: 42220, address: VOUCHER }],
    });
  });

  // The saved place is shown with its public-pin warning, but the profile name
  // is not silently copied into the public Host field.
  it("starts now at the saved place without publishing the profile name", async () => {
    mocks.profile = {
      data: { name: "Wendo Group", geoLat: -1.2864, geoLng: 36.8172 },
      isPending: false,
    };
    const before = Date.now();
    renderCreateWithVoucher();

    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("");

    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    const sent = mocks.createPost.mock.calls[0]?.[0] as {
      hostName: string;
      geoLat: number | null;
      geoLng: number | null;
      periodFrom: string;
      periodTo: string;
    };
    expect(sent.hostName).toBe("");
    expect(sent.geoLat).toBe(-1.2864);
    expect(sent.geoLng).toBe(36.8172);
    // Both ends at the current minute, not the start and end of the day.
    expect(sent.periodTo).toBe(sent.periodFrom);
    const from = Date.parse(sent.periodFrom);
    expect(from).toBeGreaterThanOrEqual(before - 60_000);
    expect(from).toBeLessThanOrEqual(Date.now());
  });

  it("asks for a head count as a number and no longer asks for a duration", async () => {
    renderCreateWithVoucher();

    const participants = screen.getByLabelText("No. of participants") as HTMLInputElement;
    expect(participants.type).toBe("number");
    expect(screen.queryByLabelText("Duration")).toBeNull();
    expect(screen.queryByLabelText("Participants")).toBeNull();

    fireEvent.change(participants, { target: { value: "20" } });
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      participants: "20",
      timeTaken: "",
    });
  });

  // clc-core refuses a post that links a resource its author does not own, so
  // both pickers search only the author's resources — unless the author is a
  // superadmin, who may link anything in the catalog.
  it("searches only the author's own resources unless they are a superadmin", () => {
    mocks.auth.session = { address: "0xAbC0000000000000000000000000000000000123", chainId: 42220 };
    const asAuthor = render(<PostEditorPage mode="create" />);
    expect(mocks.searchOwner).toBe("0xAbC0000000000000000000000000000000000123");
    asAuthor.unmount();

    mocks.auth.session = {
      address: "0xAbC0000000000000000000000000000000000123",
      chainId: 42220,
      role: "SUPERADMIN",
    };
    renderCreateWithVoucher();
    expect(mocks.searchOwner).toBeUndefined();
  });

  // clc-core rejects a half coordinate, and one half of a profile's place is
  // not a place.
  it("ignores a profile that holds only one coordinate", async () => {
    mocks.profile = { data: { geoLat: -1.2864, geoLng: null }, isPending: false };
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({ geoLat: null, geoLng: null });
  });

  it("no longer asks for a summary", async () => {
    renderCreateWithVoucher();

    expect(screen.queryByLabelText("Summary")).toBeNull();

    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    // The client turns this into the wire's null.
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({ description: "" });
  });

  it("parks an unsent post and picks it up on the next visit", async () => {
    const first = render(<PostEditorPage mode="create" />);
    typeTitle("Half-written");

    await waitFor(() => expect(window.localStorage.getItem("clc_post_draft_v1")).toBeTruthy(), {
      timeout: 2000,
    });
    first.unmount();

    render(<PostEditorPage mode="create" />);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Half-written");
    expect(screen.getByText(/Picked up where you left off/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect(window.localStorage.getItem("clc_post_draft_v1")).toBeNull();
  });

  it("parks a formatted body and reopens it formatted", async () => {
    const first = render(<PostEditorPage mode="create" />);
    typeTitle("Half-written");
    await typeBody("Market day");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Heading" }));
    });

    await waitFor(
      () => expect(window.localStorage.getItem("clc_post_draft_v1")).toContain("## Market day"),
      { timeout: 2000 },
    );
    first.unmount();

    render(<PostEditorPage mode="create" />);
    expect(
      screen.getByRole("textbox", { name: "Post text" }).querySelector("h2")?.textContent,
    ).toBe("Market day");
  });

  // The limit is the schema's, measured on the Markdown that would be stored.
  it("refuses a paste longer than a post may be", async () => {
    renderCreateWithVoucher();
    await typeBody("Short enough");

    await act(async () => {
      fireEvent.paste(screen.getByRole("textbox", { name: "Post text" }), {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === "text/plain" ? "x".repeat(REPORT_BODY_MAX + 1) : ""),
          types: ["text/plain"],
        },
      });
    });

    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({ body: "Short enough" });
  });

  it("drops the parked post once it has been submitted", async () => {
    renderCreateWithVoucher();
    typeTitle("August community harvest");
    await waitFor(() => expect(window.localStorage.getItem("clc_post_draft_v1")).toBeTruthy(), {
      timeout: 2000,
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("clc_post_draft_v1")).toBeNull();
  });

  it("links vouchers as chips from one search field", async () => {
    mocks.voucherResults = [
      { chainId: 42220, address: VOUCHER, name: "Priscilah Malii", symbol: "MALII" },
      { chainId: 42220, address: OTHER_VOUCHER, name: "Wendo Group", symbol: "WENDO" },
    ];
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");

    fireEvent.focus(screen.getByLabelText("Search vouchers"));
    fireEvent.click(screen.getByRole("option", { name: /Priscilah Malii/ }));
    fireEvent.focus(screen.getByLabelText("Search vouchers"));
    fireEvent.click(screen.getByRole("option", { name: /Wendo Group/ }));

    // Two chips, not two rows of delete buttons.
    expect(screen.getByRole("button", { name: "Unlink Priscilah Malii" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlink Wendo Group" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      vouchers: [
        { chainId: 42220, address: VOUCHER },
        { chainId: 42220, address: OTHER_VOUCHER },
      ],
    });
  });

  it("links pools independently and submits the public location warning", async () => {
    mocks.poolResults = [
      {
        chainId: 100,
        address: VOUCHER,
        name: "Kilifi Pool",
        symbol: "KLF",
      },
    ];
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");

    fireEvent.focus(screen.getByLabelText("Search pools"));
    fireEvent.click(screen.getByRole("option", { name: /Kilifi Pool/ }));
    expect(screen.getByRole("button", { name: "Unlink Kilifi Pool" })).toBeTruthy();

    fireEvent.click(screen.getByText("Place"));
    expect(
      screen.getByText(
        "The exact pin will be public. Choose a safe public meeting place, not a private home.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      pools: [{ chainId: 100, address: VOUCHER }],
    });
  });

  it("keeps a seeded voucher removable and does not treat the seed as an edit", () => {
    render(<PostEditorPage mode="create" voucher={{ chainId: 42220, address: VOUCHER }} />);

    // No name in the URL: the chip falls back to the shortened address.
    const label = `Unlink ${VOUCHER.slice(0, 8)}…${VOUCHER.slice(-6)}`;
    const unlink = screen.getByRole("button", { name: label });
    // A link rather than the discard-guard button: seeding is not an edit, so
    // Back leaves without a prompt.
    expect(screen.getByRole("link", { name: /Voucher/ })).toBeTruthy();

    fireEvent.click(unlink);
    expect(screen.queryByRole("button", { name: label })).toBeNull();
  });
});

describe("editing a post", () => {
  it("hydrates every field the next save will replace", () => {
    mocks.detail.data = saved({
      body: "## Body",
      hostName: "Wendo Group",
      participants: "20",
      timeTaken: "4 hours",
      tags: ["Youth"],
      attachments: [
        {
          kind: "FILE",
          url: "https://content.example/notes.pdf",
          filename: "notes.pdf",
          byteSize: 81_920,
        },
      ],
      images: [
        {
          url: "https://content.example/one.jpg",
          width: null,
          height: null,
          maxWidth: 1440,
          maxHeight: 2160,
          byteSize: 245_761,
          caption: "Sorting",
        },
      ],
    });
    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "August community harvest",
    );
    // The stored Markdown, shown as what it describes rather than as its source.
    expect(
      screen.getByRole("textbox", { name: "Post text" }).querySelector("h2")?.textContent,
    ).toBe("Body");
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("Wendo Group");
    expect((screen.getByLabelText("Caption for photo 1") as HTMLInputElement).value).toBe(
      "Sorting",
    );
    expect((screen.getByLabelText("Link 1") as HTMLInputElement).value).toBe(
      "https://content.example/notes.pdf",
    );
  });

  it("opens Place for an existing located post so the public-pin warning is visible", () => {
    mocks.detail.data = saved({ lat: -1.2864, lng: 36.8172 });

    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect(
      screen.getByText(
        "The exact pin will be public. Choose a safe public meeting place, not a private home.",
      ),
    ).toBeTruthy();
  });

  // PUT is assign-all, so an untouched relation has to travel back or it is
  // erased.
  it("resends untouched relations", async () => {
    mocks.detail.data = saved({
      tags: ["Youth"],
      attachments: [
        {
          kind: "FILE",
          url: "https://content.example/notes.pdf",
          filename: "notes.pdf",
          byteSize: 81_920,
        },
      ],
    });
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
    expect(mocks.updatePost.mock.calls[0]?.[0]).toMatchObject({
      id: "4633",
      input: {
        title: "Edited title",
        tags: ["Youth"],
        attachments: [
          {
            kind: "FILE",
            url: "https://content.example/notes.pdf",
            filename: "notes.pdf",
            byteSize: 81_920,
          },
        ],
      },
    });
  });

  it("requires a legacy linkless post to add a resource before saving", async () => {
    mocks.detail.data = saved({ vouchers: [], pools: [] });
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Link at least one voucher or pool")).toBeTruthy();
    expect(mocks.updatePost).not.toHaveBeenCalled();
  });

  it("saves a submitted post without a confirmation", async () => {
    mocks.detail.data = saved({ status: "SUBMITTED" });
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
  });

  // An edit stays published — posts are auto-approved — so there is nothing to
  // warn about and no confirmation in the way.
  it("saves an approved post without a warning or a confirmation", async () => {
    mocks.detail.data = saved({ status: "APPROVED" });
    mocks.updatePost.mockResolvedValue(saved({ status: "APPROVED" }));
    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect(screen.queryByText(/back for approval/)).toBeNull();

    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Post updated.");
  });

  // A backend that still queues an edit is reported as it answers, not as the
  // editor assumed.
  it("says so when the server answers with a post awaiting approval", async () => {
    mocks.detail.data = saved({ status: "APPROVED" });
    mocks.updatePost.mockResolvedValue(saved({ status: "SUBMITTED" }));
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Saved. Your post is awaiting approval again.",
      ),
    );
  });

  it("explains that only your own posts can be edited when the read fails", () => {
    mocks.detail = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect(screen.getByText(/You can only edit posts you wrote/)).toBeTruthy();
  });
});
