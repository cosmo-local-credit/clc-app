import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import * as QrCamera from "#/lib/qr-camera";
import { QrCameraError } from "#/lib/qr-camera";

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

function upload(file = new File(["image"], "qr.png", { type: "image/png" })) {
  fireEvent.change(screen.getByLabelText(/upload card image/i), { target: { files: [file] } });
}

describe("PaperWalletScanner", () => {
  const onKeyDecoded = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onKeyDecoded.mockReset();
    onCancel.mockReset();
    mockDecodeQrImageFile.mockReset();
    mockStartQrCamera.mockReset();
    mockStartQrCamera.mockResolvedValue(undefined);
  });

  it("returns to choose mode when Back is clicked", () => {
    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);

    expect(screen.getByText("Sign-in card")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close sign-in card scanner" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));
    expect(screen.getAllByRole("button", { name: /upload card image/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("button", { name: /scan qr code/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^upload card image$/i })).toBeTruthy();
  });

  it("starts the rear camera", async () => {
    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledOnce());
    expect(mockStartQrCamera.mock.calls[0][0]).toBeInstanceOf(HTMLVideoElement);
    expect(cameraOptions().facingMode).toBe("environment");
  });

  it("passes a camera decode on and returns to the choices", async () => {
    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));
    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledOnce());

    act(() => cameraOptions().onDecoded("0xcamerakey"));

    expect(onKeyDecoded).toHaveBeenCalledExactlyOnceWith("0xcamerakey");
    expect(screen.getByRole("button", { name: /scan qr code/i })).toBeTruthy();
  });

  it("releases the camera on Back and on unmount", async () => {
    const { unmount } = render(
      <PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));
    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(cameraOptions(0).signal.aborted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));
    await waitFor(() => expect(mockStartQrCamera).toHaveBeenCalledTimes(2));
    expect(cameraOptions(1).signal.aborted).toBe(false);
    unmount();
    expect(cameraOptions(1).signal.aborted).toBe(true);
  });

  it("offers image upload when camera access is denied", async () => {
    mockStartQrCamera.mockRejectedValueOnce(new QrCameraError("denied"));

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

    expect(await screen.findByText("Camera access denied.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /upload card image instead/i }));
    expect(screen.getByRole("button", { name: /^upload card image$/i })).toBeTruthy();
  });

  it("says so when there is no camera", async () => {
    mockStartQrCamera.mockRejectedValueOnce(new QrCameraError("no-camera"));

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

    expect(await screen.findByText("No camera found on this device.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /upload card image instead/i })).toBeNull();
  });

  it("says so when the camera fails to start", async () => {
    mockStartQrCamera.mockRejectedValueOnce(new QrCameraError("failed"));

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

    expect(await screen.findByText("Failed to start camera.")).toBeTruthy();
  });

  it("decodes a QR code from an uploaded image and calls onKeyDecoded", async () => {
    mockDecodeQrImageFile.mockResolvedValue("0xaCB673ea3B8B868cAb37c1bEb59E66Af31dE2e87");

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));
    const file = new File(["image"], "wallet.png", { type: "image/png" });
    upload(file);

    await waitFor(() =>
      expect(onKeyDecoded).toHaveBeenCalledWith("0xaCB673ea3B8B868cAb37c1bEb59E66Af31dE2e87"),
    );
    expect(mockDecodeQrImageFile).toHaveBeenCalledWith(file);
  });

  it("shows an error when the uploaded image has no QR code", async () => {
    mockDecodeQrImageFile.mockResolvedValue(null);

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));
    upload();

    expect(
      await screen.findByText("No QR code found. Try again with a clearer image."),
    ).toBeTruthy();
    expect(onKeyDecoded).not.toHaveBeenCalled();
  });

  it("shows the same error when the upload is not an image", async () => {
    mockDecodeQrImageFile.mockRejectedValue(new DOMException("bad image", "InvalidStateError"));

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));
    upload(new File(["not-an-image"], "blank.png", { type: "image/png" }));

    expect(
      await screen.findByText("No QR code found. Try again with a clearer image."),
    ).toBeTruthy();
    expect(onKeyDecoded).not.toHaveBeenCalled();
  });

  it("allows retrying upload after an error", async () => {
    mockDecodeQrImageFile.mockResolvedValueOnce(null).mockResolvedValueOnce("0xretrykey");

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));

    upload();
    expect(
      await screen.findByText("No QR code found. Try again with a clearer image."),
    ).toBeTruthy();

    upload();
    await waitFor(() => expect(onKeyDecoded).toHaveBeenCalledWith("0xretrykey"));
  });

  it("ignores a late scan result after Back is clicked", async () => {
    let resolveDecode: (value: string) => void = () => {};
    mockDecodeQrImageFile.mockReturnValue(new Promise((resolve) => (resolveDecode = resolve)));

    render(<PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^upload card image$/i }));
    upload();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    await act(async () => {
      resolveDecode("0xlatekey");
      await Promise.resolve();
    });

    expect(onKeyDecoded).not.toHaveBeenCalled();
  });
});
