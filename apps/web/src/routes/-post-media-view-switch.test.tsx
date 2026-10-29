import type { ManagedReportDetail } from "@clc/api/features/reports/client";
import { emptyReportWrite, type ReportWrite } from "@clc/core/features/reports/logic";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/posts/hooks/use-post-mutations", () => ({
  useCreatePost: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdatePost: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: [], isPending: false }),
}));

import { DESKTOP_MEDIA } from "#/desktop/layout";
import { LayoutSwitch } from "#/desktop/switch";
import {
  usePostEditorCreateSeed,
  usePostEditorForm,
  type PostEditorSeed,
} from "#/features/posts/hooks/use-post-editor";
import {
  clearPostDraft,
  readPostDraft,
  writePostDraft,
} from "#/features/posts/api/post-draft-storage";
import { clearViewDrafts, useViewDraftStore } from "#/lib/view-drafts";

const PHOTO = {
  url: "https://storage.example/original.jpg",
  width: null,
  height: null,
  maxWidth: 1200,
  maxHeight: 800,
  byteSize: 1024,
  caption: "Original photo",
};
const NEW_PHOTO = { ...PHOTO, url: "https://storage.example/completed-upload.jpg", caption: "New" };
const ORIGINAL: ReportWrite = {
  ...emptyReportWrite,
  title: "Community harvest",
  imageUrl: PHOTO.url,
  images: [PHOTO],
  attachments: [
    { kind: "FILE", url: "https://storage.example/notes.pdf", filename: "notes.pdf", byteSize: 40 },
  ],
};
const CHANGED: ReportWrite = {
  ...ORIGINAL,
  imageUrl: NEW_PHOTO.url,
  images: [NEW_PHOTO],
  attachments: [
    { kind: "EMBED", url: "https://example.com/updated-notes", filename: null, byteSize: null },
  ],
};
const REMOVED: ReportWrite = { ...ORIGINAL, imageUrl: null, images: [], attachments: [] };
const POST = { id: "harvest", status: "SUBMITTED" } as ManagedReportDetail;

/** The real form is remounted by LayoutSwitch, as the two editor views are. */
function EditorFields() {
  const editor = usePostEditorForm({ post: POST, initial: ORIGINAL, previousStatus: "SUBMITTED" });
  const replaceMedia = (values: ReportWrite) => {
    editor.form.setFieldValue("images", values.images);
    editor.form.setFieldValue("imageUrl", values.imageUrl);
    editor.form.setFieldValue("attachments", values.attachments);
  };
  return (
    <>
      <button type="button" onClick={() => replaceMedia(CHANGED)}>
        Update media
      </button>
      <button type="button" onClick={() => replaceMedia(REMOVED)}>
        Remove media
      </button>
      <output aria-label="Post values">{JSON.stringify(editor.values)}</output>
      <output aria-label="Unsaved changes">{String(editor.isDirty)}</output>
    </>
  );
}

function MobileEditor() {
  return <EditorFields />;
}
function DesktopEditor() {
  return <EditorFields />;
}

function CreateFields({ seed }: { seed: PostEditorSeed }) {
  const editor = usePostEditorForm(seed);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          editor.form.setFieldValue("title", "Latest title");
          editor.form.setFieldValue("images", CHANGED.images);
          editor.form.setFieldValue("imageUrl", CHANGED.imageUrl);
        }}
      >
        Edit new post
      </button>
      <output aria-label="Post values">{JSON.stringify(editor.values)}</output>
      <output aria-label="Unsaved changes">{String(editor.isDirty)}</output>
    </>
  );
}
function CreateEditor() {
  const result = usePostEditorCreateSeed(null);
  return result ? <CreateFields key={result.formKey} seed={result.seed} /> : null;
}
function MobileCreator() {
  return <CreateEditor />;
}
function DesktopCreator() {
  return <CreateEditor />;
}

const media = { matches: false, listeners: new Set<() => void>() };
function resize(desktop: boolean) {
  act(() => {
    media.matches = desktop;
    for (const listener of media.listeners) listener();
  });
}
const values = () => JSON.parse(screen.getByLabelText("Post values").textContent ?? "{}");

beforeEach(() => {
  vi.clearAllMocks();
  clearViewDrafts();
  clearPostDraft();
  media.listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === DESKTOP_MEDIA && media.matches;
    },
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  }));
});

afterEach(() => {
  clearViewDrafts();
  clearPostDraft();
  vi.useRealTimers();
  delete document.documentElement.dataset.layout;
  vi.unstubAllGlobals();
});

describe("New post before the local draft debounce settles", () => {
  it.each([false, true])("keeps the newest fields when an older local draft exists=%s", (saved) => {
    vi.useFakeTimers();
    const owner = "0x1111111111111111111111111111111111111111";
    if (saved) writePostDraft(owner, ORIGINAL);
    media.matches = false;
    document.documentElement.dataset.layout = "mobile";
    render(<LayoutSwitch mobile={<MobileCreator />} desktop={<DesktopCreator />} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit new post" }));
    // No timer has run: local storage still has the older copy, or nothing.
    expect(readPostDraft(owner)?.title ?? null).toBe(saved ? ORIGINAL.title : null);

    resize(true);
    expect(values()).toMatchObject({
      title: "Latest title",
      images: CHANGED.images,
      imageUrl: CHANGED.imageUrl,
    });
    expect(screen.getByLabelText("Unsaved changes").textContent).toBe("true");
    resize(false);
    expect(values().title).toBe("Latest title");
    expect(readPostDraft(owner)?.title ?? null).toBe(saved ? ORIGINAL.title : null);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(readPostDraft(owner)?.title).toBe("Latest title");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Completed post media across a layout switch", () => {
  it.each([false, true])(
    "keeps completed URLs and metadata starting in desktop=%s",
    async (desktop) => {
      media.matches = desktop;
      document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
      render(<LayoutSwitch mobile={<MobileEditor />} desktop={<DesktopEditor />} />);
      fireEvent.click(screen.getByRole("button", { name: "Update media" }));
      expect(values()).toEqual(CHANGED);

      resize(!desktop);
      await waitFor(() => expect(values()).toEqual(CHANGED));
      expect(screen.getByLabelText("Unsaved changes").textContent).toBe("true");
      resize(desktop);
      await waitFor(() => expect(values()).toEqual(CHANGED));
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("keeps removals instead of resurrecting the saved attachments, photos, and cover", async () => {
    media.matches = false;
    document.documentElement.dataset.layout = "mobile";
    render(<LayoutSwitch mobile={<MobileEditor />} desktop={<DesktopEditor />} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove media" }));
    resize(true);
    await waitFor(() => expect(values()).toEqual(REMOVED));
    expect(Object.keys(useViewDraftStore.getState().entries)).toHaveLength(1);
  });
});
