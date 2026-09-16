import { MAX_UPLOAD_BYTES } from "@clc/api/features/images/policy";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AvatarPicker } from "./avatar-picker";

function file(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  // Size is what the policy reads, and constructing megabytes of buffer to test a
  // limit is wasteful.
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function choose(f: File) {
  const input = screen.getByLabelText("Choose a profile photo");
  fireEvent.change(input, { target: { files: [f] } });
}

beforeEach(() => {
  // jsdom has no object URLs.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

describe("AvatarPicker", () => {
  it("offers to add a photo when there is none", () => {
    render(<AvatarPicker value={null} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /add a photo/i })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Optional")).toBeTruthy();
  });

  it("opens the frame rather than accepting the file as chosen", () => {
    const onChange = vi.fn();
    render(<AvatarPicker value={null} onChange={onChange} />);

    choose(file("me.jpg", "image/jpeg"));

    // An avatar has a fixed display shape, so the file is framed first. Accepting
    // it here would store a landscape photo to be shown in a circle.
    expect(screen.getByText("Frame your photo")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the frame closed for a file it refused", () => {
    render(<AvatarPicker value={null} onChange={vi.fn()} />);

    choose(file("me.heic", "image/heic"));

    expect(screen.queryByText("Frame your photo")).toBeNull();
  });

  it("previews the chosen file and offers to remove it", () => {
    const onChange = vi.fn();
    render(<AvatarPicker value={file("me.png", "image/png")} onChange={onChange} />);

    expect(screen.getByRole("img")).toHaveProperty("src", "blob:preview");
    expect(screen.getByRole("button", { name: /change photo/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("refuses a container the service cannot decode, naming the ones it can", () => {
    const onChange = vi.fn();
    render(<AvatarPicker value={null} onChange={onChange} />);

    // The iOS Camera Roll case: HEIC is a 400 from the service, so it never leaves
    // the device.
    choose(file("me.heic", "image/heic"));

    expect(screen.getByText(/JPEG, PNG or WebP/i)).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("refuses a file the request limit would reject", () => {
    const onChange = vi.fn();
    render(<AvatarPicker value={null} onChange={onChange} />);

    choose(file("huge.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1));

    expect(screen.getByText(/too large/i)).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows a stored avatar until a new one is chosen", () => {
    render(
      <AvatarPicker value={null} onChange={vi.fn()} currentUrl="https://cdn.test/a_400_ab.webp" />,
    );

    expect(screen.getByRole("img")).toHaveProperty("src", "https://cdn.test/a_400_ab.webp");
    // Nothing new is pending, so there is nothing to remove.
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });
});
