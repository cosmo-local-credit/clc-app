import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ImageCropDialog } from "./image-crop-dialog";

const photo = () => new File([new Uint8Array(8)], "logo.png", { type: "image/png" });

/**
 * jsdom lays nothing out, so clientWidth/clientHeight are always 0 and the frame
 * would measure itself as empty. Fixing them here is what lets the test see the
 * scale the component computes — the bug this guards against rendered the image
 * at zero size because the frame was never measured at all.
 */
function stubLayout(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

describe("ImageCropDialog", () => {
  it("scales the image to cover the frame it measured", async () => {
    stubLayout(480, 256);
    render(
      <ImageCropDialog
        file={photo()}
        purpose="pool.image"
        onCancel={vi.fn()}
        onCropped={vi.fn()}
      />,
    );

    const image = await waitFor(() => {
      const found = document.querySelector<HTMLImageElement>('[role="group"] img');
      expect(found).toBeTruthy();
      return found as HTMLImageElement;
    });

    // The frame is measured on mount rather than on a resize event: the dialog
    // lives in a portal that mounts after this component's first effects, so a
    // ref read at open time is null and no resize ever follows.
    const width = Number.parseFloat(image.style.width);
    expect(width).toBeGreaterThan(0);
    // A 1600x900 source in a 256x256 square frame covers via its height.
    expect(width).toBeCloseTo((1600 * 256) / 900, 0);
    // Tailwind's preflight caps images at max-width:100% (preflight.css:225) and
    // an inline width does not override a max-width, so zooming grew the height
    // against a pinned width and stretched the photo. jsdom applies no
    // stylesheet, so the class is the only thing a test here can hold onto.
    expect(image.className).toContain("max-w-none");
  });

  it("hands back a file when the frame is confirmed", async () => {
    const onCropped = vi.fn();
    render(
      <ImageCropDialog
        file={photo()}
        purpose="pool.image"
        onCancel={vi.fn()}
        onCropped={onCropped}
      />,
    );

    await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Crop and upload" }));

    await waitFor(() => expect(onCropped).toHaveBeenCalledTimes(1));
    expect(onCropped.mock.calls[0]![0]).toBeInstanceOf(File);
  });
});
