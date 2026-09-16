import { MAX_UPLOAD_BYTES } from "@clc/api/features/images/policy";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mutateAsync = vi.hoisted(() => vi.fn());
const reset = vi.hoisted(() => vi.fn());
const uploadState = vi.hoisted(() => ({ isPending: false, isError: false }));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: (input: unknown) => mutateAsync(input),
    reset,
    get isPending() {
      return uploadState.isPending;
    },
    get isError() {
      return uploadState.isError;
    },
  }),
}));

import { ImageUploadField } from "./image-upload-field";

function file(name: string, type: string, size = 2048): File {
  const f = new File([new Uint8Array(1)], name, { type });
  // The policy reads size; allocating megabytes to test a limit is wasteful.
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/**
 * Confirms the crop frame that selection opens, which is what starts the upload.
 *
 * Readiness is the framed image appearing rather than the button's disabled
 * attribute: the frame renders its image once the file has decoded, and that is
 * the same condition that enables the button.
 */
async function confirmCrop() {
  await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));
}

function choose(f: File) {
  fireEvent.change(screen.getByLabelText("Logo", { selector: "input" }), {
    target: { files: [f] },
  });
}

beforeEach(() => {
  mutateAsync.mockReset();
  reset.mockReset();
  uploadState.isPending = false;
  uploadState.isError = false;
  mutateAsync.mockResolvedValue({
    url: "https://cdn.test/pool/abc_400_a3f91c2e.webp",
    width: 400,
    height: 400,
    byteSize: 6516,
    contentType: "image/webp",
  });
});

describe("ImageUploadField", () => {
  it("uploads on selection and hands back the stored URL", async () => {
    const onChange = vi.fn();
    render(<ImageUploadField label="Logo" purpose="pool.image" value={null} onChange={onChange} />);

    choose(file("logo.png", "image/png"));
    await confirmCrop();

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://cdn.test/pool/abc_400_a3f91c2e.webp"),
    );
    const input = mutateAsync.mock.calls[0]?.[0] as { purpose: string; uploadId: string };
    expect(input.purpose).toBe("pool.image");
    // Opaque and per-attempt: the object key is derived from it, so it must carry
    // no identity and must not be reused across different files.
    expect(input.uploadId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("offers Replace once there is an image, and Upload before that", () => {
    const { rerender } = render(
      <ImageUploadField label="Logo" purpose="pool.image" value={null} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /upload/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();

    rerender(
      <ImageUploadField
        label="Logo"
        purpose="pool.image"
        value="https://cdn.test/pool/a_400_ab.webp"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy();
  });

  it("previews the stored image", () => {
    // A banner, because it is the one shape previewed as a plain image. A 1:1
    // preview goes through Avatar, which mounts its image only after the browser
    // reports a successful load — something jsdom never does, so asserting it
    // would be asserting Base UI's loading behaviour rather than this control's.
    const { container } = render(
      <ImageUploadField
        label="Banner"
        purpose="pool.banner"
        value="https://cdn.test/pool/b_1280_ab.webp"
        onChange={vi.fn()}
      />,
    );

    // alt="" on purpose: the label names the control, so the preview is
    // decorative and carries no role.
    expect(container.querySelector("img")).toHaveProperty(
      "src",
      "https://cdn.test/pool/b_1280_ab.webp",
    );
  });

  it("reports removal as null and leaves the endpoint to interpret it", () => {
    const onChange = vi.fn();
    render(
      <ImageUploadField
        label="Logo"
        purpose="pool.image"
        value="https://cdn.test/pool/a_400_ab.webp"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("refuses a container the service cannot decode, without calling it", () => {
    const onChange = vi.fn();
    render(<ImageUploadField label="Logo" purpose="pool.image" value={null} onChange={onChange} />);

    // HEIC is what an operator's phone hands over, and it is a 400 from storage.
    choose(file("logo.heic", "image/heic"));

    expect(screen.getByRole("alert").textContent).toMatch(/JPEG, PNG or WebP/i);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a file the request limit would reject", () => {
    render(<ImageUploadField label="Logo" purpose="pool.image" value={null} onChange={vi.fn()} />);

    choose(file("huge.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1));

    expect(screen.getByRole("alert").textContent).toMatch(/too large/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the previous image when an upload fails", async () => {
    mutateAsync.mockRejectedValue(new Error("storage unreachable"));
    uploadState.isError = true;
    const onChange = vi.fn();
    const { container } = render(
      <ImageUploadField
        label="Logo"
        purpose="pool.image"
        value="https://cdn.test/pool/old_400_ab.webp"
        onChange={onChange}
      />,
    );

    choose(file("logo.png", "image/png"));
    await confirmCrop();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/upload failed/i));
    // Not cleared: a failed replacement must not lose the image that is stored.
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toHaveProperty(
      "src",
      "https://cdn.test/pool/old_400_ab.webp",
    );
  });
});
