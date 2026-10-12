import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import * as QrCamera from "#/lib/qr-camera";
import { QrCameraError } from "#/lib/qr-camera";

import { PaperWalletReader } from "./paper-wallet-reader";

type StartQrCamera = typeof QrCamera.startQrCamera;

const { mockDecodeQrImageFile, mockStartQrCamera } = vi.hoisted(() => ({
  mockDecodeQrImageFile: vi.fn<(file: Blob) => Promise<string | null>>(),
  mockStartQrCamera: vi.fn<StartQrCamera>(),
}));

vi.mock("#/lib/qr-decode", () => ({ decodeQrImageFile: mockDecodeQrImageFile }));
vi.mock("#/lib/qr-camera", async (importOriginal) => ({
  ...(await importOriginal<typeof QrCamera>()),
  startQrCamera: mockStartQrCamera,
}));

function cameraOptions(call = 0) {
  return mockStartQrCamera.mock.calls[call][1];
}

function upload(file = new File(["image"], "wallet.png", { type: "image/png" })) {
  fireEvent.change(screen.getByLabelText("Upload a paper wallet image"), {
    target: { files: [file] },
  });
}

describe("PaperWalletReader", () => {
  const onDecoded = vi.fn();

  beforeEach(() => {
    onDecoded.mockReset();
    mockDecodeQrImageFile.mockReset();
    mockStartQrCamera.mockReset();
    mockStartQrCamera.mockResolvedValue(undefined);
  });

  it("passes an uploaded wallet's payload on", async () => {
    mockDecodeQrImageFile.mockResolvedValue("https://cosmolocal.credit/?w=0xkey");
    render(<PaperWalletReader onDecoded={onDecoded} />);

    upload();

    await waitFor(() =>
      expect(onDecoded).toHaveBeenCalledExactlyOnceWith("https://cosmolocal.credit/?w=0xkey"),
    );
  });

  it("says so when the image has no QR code, or is not an image", async () => {
    mockDecodeQrImageFile.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("bad"));
    render(<PaperWalletReader onDecoded={onDecoded} />);

    upload();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "No QR code found in that image. Try a clearer scan or photo.",
    );

    upload();
    await waitFor(() => expect(mockDecodeQrImageFile).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert").textContent).toBe(
      "No QR code found in that image. Try a clearer scan or photo.",
    );
    expect(onDecoded).not.toHaveBeenCalled();
  });

  it("prefers the rear camera", async () => {
    render(<PaperWalletReader onDecoded={onDecoded} />);

    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));

    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledOnce());
    expect(cameraOptions().facingMode).toBe("environment");
  });

  it("passes a camera decode on and returns to the choices", async () => {
    render(<PaperWalletReader onDecoded={onDecoded} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));
    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledOnce());

    act(() => cameraOptions().onDecoded("0xcamerakey"));

    expect(onDecoded).toHaveBeenCalledExactlyOnceWith("0xcamerakey");
    expect(screen.getByRole("button", { name: "Upload paper wallet image" })).toBeTruthy();
  });

  it("releases the camera on Cancel", async () => {
    render(<PaperWalletReader onDecoded={onDecoded} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));
    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cameraOptions().signal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Scan with camera" })).toBeTruthy();
  });

  it.each([
    ["denied", "Camera access was denied. Upload an image of the wallet instead."],
    ["no-camera", "No camera found on this machine. Upload an image instead."],
    ["failed", "Could not start the camera. Upload an image of the wallet instead."],
  ] as const)("returns to the choices when the camera is %s", async (kind, message) => {
    mockStartQrCamera.mockRejectedValueOnce(new QrCameraError(kind));
    render(<PaperWalletReader onDecoded={onDecoded} />);

    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByRole("button", { name: "Upload paper wallet image" })).toBeTruthy();
  });

  it("ignores an upload that decodes after the camera was opened", async () => {
    let resolveDecode: (value: string) => void = () => {};
    mockDecodeQrImageFile.mockReturnValue(new Promise((resolve) => (resolveDecode = resolve)));
    render(<PaperWalletReader onDecoded={onDecoded} />);

    upload();
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await act(async () => {
      resolveDecode("0xlatekey");
      await Promise.resolve();
    });

    expect(onDecoded).not.toHaveBeenCalled();
  });
});
