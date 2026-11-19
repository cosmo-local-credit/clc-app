import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setBody: vi.fn(),
  addImage: vi.fn(),
  removeImage: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("#/features/messaging/hooks/use-operator-helpdesk", () => ({
  useOperatorHelpdeskReply: () => ({
    body: "",
    images: [],
    imageError: null,
    canAddImage: true,
    uploading: false,
    canSend: true,
    send: { isPending: false, isError: false },
    setBody: mocks.setBody,
    addImage: mocks.addImage,
    removeImage: mocks.removeImage,
    submit: mocks.submit,
    ...mocks.state,
  }),
}));

import { OperatorHelpdeskComposer } from "./operator-helpdesk-composer";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {};
});

describe("OperatorHelpdeskComposer", () => {
  it("handles text, form submission, photo selection and removal", () => {
    mocks.state = {
      images: [
        {
          key: "photo-1",
          previewUrl: "blob:preview",
          url: null,
          failed: false,
        },
      ],
    };
    render(<OperatorHelpdeskComposer conversationId={21} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), {
      target: { value: "I can help" },
    });
    expect(mocks.setBody).toHaveBeenCalledWith("I can help");

    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(mocks.removeImage).toHaveBeenCalledWith("photo-1");

    const file = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("photo input missing");
    const inputClick = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Add a photo" }));
    expect(inputClick).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [] } });
    expect(mocks.addImage).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.addImage).toHaveBeenCalledWith(file);

    fireEvent.submit(screen.getByRole("button", { name: "Send reply" }).closest("form")!);
    expect(mocks.submit).toHaveBeenCalled();
  });

  it("submits Enter on desktop while preserving Shift+Enter", () => {
    render(<OperatorHelpdeskComposer conversationId={21} desktop />);
    const reply = screen.getByRole("textbox", { name: "Reply" });
    fireEvent.keyDown(reply, { key: "Enter", shiftKey: true });
    expect(mocks.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(reply, { key: "Enter" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unsupported", "Use a JPEG, PNG or WebP photo under 8 MB."],
    ["upload-failed", "The photo didn't upload. Remove it and try again."],
  ])("shows the %s photo error", (imageError, message) => {
    mocks.state = { imageError };
    render(<OperatorHelpdeskComposer conversationId={21} />);
    expect(screen.getByRole("alert").textContent).toContain(message);
  });

  it("keeps failed replies visible and reports pending work", () => {
    mocks.state = {
      canSend: false,
      uploading: true,
      send: { isPending: true, isError: true },
    };
    render(<OperatorHelpdeskComposer conversationId={21} />);
    expect(screen.getByText("Couldn't send. Your message is kept; send it again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sending…" }).getAttribute("aria-busy")).toBe("true");
  });
});
