import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ImageCropDialog } from "./image-crop-dialog";

const photo = () => new File([new Uint8Array(8)], "logo.png", { type: "image/png" });

describe("ImageCropDialog", () => {
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
