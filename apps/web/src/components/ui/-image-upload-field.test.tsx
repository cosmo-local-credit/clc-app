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
  fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
}

function choose(f: File, label = "Photo") {
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), {
    target: { files: [f] },
  });
}

function renderField(props: Partial<Parameters<typeof ImageUploadField>[0]> = {}) {
  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <ImageUploadField
      label="Photo"
      purpose="offering.photo"
      value={null}
      onChange={onChange}
      onBusyChange={onBusyChange}
      {...props}
    />,
  );
  return { onChange, onBusyChange };
}

beforeEach(() => {
  mutateAsync.mockReset();
  reset.mockReset();
  uploadState.isPending = false;
  uploadState.isError = false;
  mutateAsync.mockResolvedValue({
    url: "https://cdn.test/offering/abc_800_a3f91c2e.webp",
    width: 800,
    height: 800,
    byteSize: 6516,
    contentType: "image/webp",
  });
});

describe("choosing a photo", () => {
  it("opens the rear camera and uploads its photo through the usual crop flow", async () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    const cameraInput = screen.getByLabelText("Take photo", { selector: "input" });
    expect(cameraInput.getAttribute("capture")).toBe("environment");

    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    choose(file("product.jpg", "image/jpeg"), "Take photo");
    await confirmCrop();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("https://cdn.test/offering/abc_800_a3f91c2e.webp");
  });

  // The whole point of the crop step: the storage service resizes but never
  // crops, so a photo that is not framed here arrives at the wrong shape and
  // every screen throws away the sides at render time.
  it("frames the photo before uploading, and reports the stored URL", async () => {
    const { onChange } = renderField();

    choose(file("product.jpg", "image/jpeg"));

    expect(await waitFor(() => screen.getByText("Frame your photo"))).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();

    await confirmCrop();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({ purpose: "offering.photo" });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://cdn.test/offering/abc_800_a3f91c2e.webp"),
    );
  });

  // A fresh id per attempt. The object key is derived from it, so reusing one
  // across two different files is the only way to overwrite an object this
  // service treats as immutable.
  it("uses a new upload id for each attempt", async () => {
    renderField();

    choose(file("a.jpg", "image/jpeg"));
    await confirmCrop();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    choose(file("b.jpg", "image/jpeg"));
    await confirmCrop();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    const ids = mutateAsync.mock.calls.map((call) => call[0].uploadId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("tells the parent when it is busy and when it is not", async () => {
    const { onBusyChange } = renderField();

    choose(file("product.jpg", "image/jpeg"));
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));

    await confirmCrop();
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  // The shared policy decides what is worth sending, so a file the service would
  // reject never leaves the device — and the message names the fix rather than
  // repeating the service's error code.
  it.each([
    ["a HEIC from the camera roll", file("photo.heic", "image/heic"), /JPEG, PNG or WebP/],
    ["a file over the ceiling", file("big.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1), /under 8 MB/],
  ])("refuses %s without uploading", async (_label, rejected, message) => {
    renderField();

    choose(rejected);

    expect(await waitFor(() => screen.getByRole("alert").textContent)).toMatch(message);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("Frame your photo")).toBeNull();
  });

  it("keeps the existing value when the upload fails", async () => {
    uploadState.isError = true;
    mutateAsync.mockRejectedValue(new Error("storage down"));
    const { onChange } = renderField({ value: "https://cdn.test/offering/old_800_b.webp" });

    choose(file("product.jpg", "image/jpeg"));
    await confirmCrop();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't upload/));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears to null on Remove", () => {
    const { onChange } = renderField({ value: "https://cdn.test/offering/old_800_b.webp" });

    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("the preview", () => {
  // Both are cropped 1:1; only the shape shown differs. A product photo is not an
  // identity mark, so it must not be previewed as a circle nobody will see.
  it("is a square for a product photo and a circle for an avatar", () => {
    const { container } = render(
      <ImageUploadField
        label="Photo"
        purpose="offering.photo"
        value="https://cdn.test/offering/a_800_b.webp"
        onChange={() => {}}
      />,
    );
    expect(container.querySelector(".rounded-full")).toBeNull();

    const avatar = render(
      <ImageUploadField
        label="Avatar"
        purpose="profile.avatar"
        value="https://cdn.test/profile/a_400_b.webp"
        onChange={() => {}}
      />,
    );
    expect(avatar.container.querySelector(".rounded-full")).toBeTruthy();
  });
});
