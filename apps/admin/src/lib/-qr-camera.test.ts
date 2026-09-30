import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { QrCameraError, startQrCamera } from "#/lib/qr-camera";

const { readFrame } = vi.hoisted(() => ({
  readFrame: vi.fn<(video: HTMLVideoElement) => Promise<string | null>>(),
}));

vi.mock("#/lib/qr-decode", () => ({ createQrFrameReader: () => readFrame }));

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>();
let video: HTMLVideoElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  video = document.createElement("video");
  video.play = vi.fn().mockResolvedValue(undefined);
  readFrame.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  getUserMedia.mockReset();
  readFrame.mockReset();
});

describe("startQrCamera", () => {
  it("asks for the rear camera when told to, and any camera otherwise", async () => {
    getUserMedia.mockImplementation(async () => fakeStream().stream);

    await startQrCamera(video, {
      facingMode: "environment",
      onDecoded: vi.fn(),
      signal: new AbortController().signal,
    });
    await startQrCamera(video, { onDecoded: vi.fn(), signal: new AbortController().signal });

    expect(getUserMedia.mock.calls.map(([constraints]) => constraints)).toEqual([
      { audio: false, video: { facingMode: { ideal: "environment" } } },
      { audio: false, video: true },
    ]);
  });

  it("reads frames until one decodes, then releases the camera and reports once", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    readFrame.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue("0xkey");
    const onDecoded = vi.fn();

    await startQrCamera(video, { onDecoded, signal: new AbortController().signal });
    expect(video.srcObject).toBe(stream);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(readFrame).toHaveBeenCalledTimes(3);
    expect(onDecoded).toHaveBeenCalledExactlyOnceWith("0xkey");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it("reads about ten frames a second", async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);

    await startQrCamera(video, { onDecoded: vi.fn(), signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(readFrame.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(readFrame.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("keeps reading after a frame fails to decode", async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);
    readFrame.mockRejectedValueOnce(new Error("bad frame")).mockResolvedValue("0xkey");
    const onDecoded = vi.fn();

    await startQrCamera(video, { onDecoded, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(300);

    expect(onDecoded).toHaveBeenCalledWith("0xkey");
  });

  it("stops reading and releases the camera when aborted", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const controller = new AbortController();
    const onDecoded = vi.fn();

    await startQrCamera(video, { onDecoded, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(250);
    controller.abort();
    const framesRead = readFrame.mock.calls.length;
    readFrame.mockResolvedValue("0xlate");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(readFrame).toHaveBeenCalledTimes(framesRead);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(onDecoded).not.toHaveBeenCalled();
  });

  it("releases a camera that is granted after the abort", async () => {
    const { stream, track } = fakeStream();
    let grant: (stream: MediaStream) => void = () => {};
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const controller = new AbortController();

    const started = startQrCamera(video, { onDecoded: vi.fn(), signal: controller.signal });
    controller.abort();
    grant(stream);

    await expect(started).resolves.toBeUndefined();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(readFrame).not.toHaveBeenCalled();
  });

  it("does not report a refusal that arrives after the abort", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const controller = new AbortController();

    const started = startQrCamera(video, { onDecoded: vi.fn(), signal: controller.signal });
    controller.abort();

    await expect(started).resolves.toBeUndefined();
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "no-camera"],
    ["OverconstrainedError", "no-camera"],
    ["NotReadableError", "failed"],
  ])("reports %s as %s", async (name, kind) => {
    getUserMedia.mockRejectedValue(new DOMException("camera", name));

    const started = startQrCamera(video, {
      onDecoded: vi.fn(),
      signal: new AbortController().signal,
    });

    await expect(started).rejects.toBeInstanceOf(QrCameraError);
    await expect(started).rejects.toMatchObject({ kind });
  });

  it("reports no camera when the browser has no media devices", async () => {
    vi.stubGlobal("navigator", {});

    await expect(
      startQrCamera(video, { onDecoded: vi.fn(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ kind: "no-camera" });
  });

  it("releases the camera and reports a failure when the video will not play", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    video.play = vi.fn().mockRejectedValue(new DOMException("blocked", "AbortError"));

    await expect(
      startQrCamera(video, { onDecoded: vi.fn(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ kind: "failed" });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(readFrame).not.toHaveBeenCalled();
  });
});
