import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useVoucherSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    results: [],
    status: "idle",
    retry: vi.fn(),
  }),
}));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload, reset: vi.fn(), isPending: false }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

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
    vouchers: [],
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
});

const VOUCHER = "0x1111111111111111111111111111111111111111";

function typeTitle(value: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value } });
}

describe("creating a post", () => {
  // Title is the only required field: everything else is behind a details
  // group so a quick post stays quick.
  it("submits with nothing but a title", async () => {
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      title: "August community harvest",
      tags: [],
      images: [],
      attachments: [],
      vouchers: [],
    });
  });

  it("refuses a blank title rather than sending it", async () => {
    render(<PostEditorPage mode="create" />);
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBeTruthy());
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("says the post is awaiting approval and lands on My posts", async () => {
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Submitted for approval."));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/posts/mine" });
  });

  // The bytes are already stored, so a retry must not re-upload them and the
  // typed text must survive.
  it("keeps the form after a failed save", async () => {
    mocks.createPost.mockRejectedValue(new Error("Network is down"));
    render(<PostEditorPage mode="create" />);
    typeTitle("August community harvest");
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Network is down"));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "August community harvest",
    );
  });

  it("disables Save while photos are uploading", async () => {
    // One upload that never settles, so the busy state is observable.
    mocks.upload.mockReturnValue(new Promise(() => {}));
    render(<PostEditorPage mode="create" />);
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

  it("shows Write and Preview as one pressed control, never side by side", () => {
    render(<PostEditorPage mode="create" />);
    const toggle = screen.getByRole("button", { name: "Preview" });

    expect(screen.getByLabelText("Post text")).toBeTruthy();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    // Pressed replaces the textarea rather than appearing beside it.
    expect(screen.queryByLabelText("Post text")).toBeNull();
    expect(screen.getByText("Nothing to preview yet.")).toBeTruthy();
  });

  it("renders the body as markdown while Preview is pressed", () => {
    render(<PostEditorPage mode="create" />);
    fireEvent.change(screen.getByLabelText("Post text"), {
      target: { value: "## What happened" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("What happened").tagName).toBe("H3");
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
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost.mock.calls[0]?.[0]).toMatchObject({
      title: "Harvest at the shop",
      vouchers: [{ chainId: 42220, address: VOUCHER }],
    });
  });

  it("keeps a seeded voucher removable and does not treat the seed as an edit", () => {
    render(<PostEditorPage mode="create" voucher={{ chainId: 42220, address: VOUCHER }} />);

    // No name in the URL: the row falls back to the address.
    const unlink = screen.getByRole("button", { name: `Unlink ${VOUCHER}` });
    // A link rather than the discard-guard button: seeding is not an edit, so
    // Back leaves without a prompt.
    expect(screen.getByRole("link", { name: /Voucher/ })).toBeTruthy();

    fireEvent.click(unlink);
    expect(screen.queryByRole("button", { name: `Unlink ${VOUCHER}` })).toBeNull();
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
    expect((screen.getByLabelText("Post text") as HTMLTextAreaElement).value).toBe("## Body");
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("Wendo Group");
    expect((screen.getByLabelText("Caption for photo 1") as HTMLInputElement).value).toBe(
      "Sorting",
    );
    expect((screen.getByLabelText("Attachment 1 link") as HTMLInputElement).value).toBe(
      "https://content.example/notes.pdf",
    );
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

  it("saves a submitted post without a confirmation", async () => {
    mocks.detail.data = saved({ status: "SUBMITTED" });
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
  });

  // Editing an approved post resubmits it, so it leaves the public feed. The
  // author has to be told before it happens, not after.
  it("warns an approved author before resubmitting", async () => {
    mocks.detail.data = saved({ status: "APPROVED" });
    mocks.updatePost.mockResolvedValue(saved({ status: "SUBMITTED" }));
    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect(screen.getByText(/Saving changes sends it back for approval/)).toBeTruthy();

    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updatePost).not.toHaveBeenCalled();
    expect(screen.getByText("Send this post back for approval?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save and resubmit" }));

    await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Saved. Your post is awaiting approval again.");
  });

  it("says nothing about approval when an admin edit stays approved", async () => {
    mocks.detail.data = saved({ status: "APPROVED" });
    mocks.updatePost.mockResolvedValue(saved({ status: "APPROVED" }));
    render(<PostEditorPage mode="edit" reportId="4633" />);
    typeTitle("Edited title");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and resubmit" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Post updated."));
  });

  it("explains that only your own posts can be edited when the read fails", () => {
    mocks.detail = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<PostEditorPage mode="edit" reportId="4633" />);

    expect(screen.getByText(/You can only edit posts you wrote/)).toBeTruthy();
  });
});
