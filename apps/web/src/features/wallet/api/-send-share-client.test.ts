import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createSendShare, getSendShare, getSendShareEligibility } from "./send-share-client";

function response(result: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: () =>
      Promise.resolve(
        JSON.stringify(
          status === 404
            ? { ok: false, code: "E03", description: "share not found" }
            : { ok: true, result },
        ),
      ),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("send share client", () => {
  it("checks whether the confirmed recipient can receive a private attachment", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => response({ eligible: true }));

    await expect(
      getSendShareEligibility("0x2222222222222222222222222222222222222222"),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/users/me/shares/eligibility/0x2222222222222222222222222222222222222222",
      ),
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("creates an attachment only after a transaction hash is available", async () => {
    const attachment = {
      id: 1,
      trackingId: "tracking-1",
      txHash: `0x${"11".repeat(32)}`,
      permission: 1,
      note: "Thanks for the delivery",
      createdAt: "2026-08-04T12:00:00Z",
      sharedBy: { name: "Alice", email: "alice@example.com" },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => response(attachment));

    await expect(
      createSendShare(attachment.txHash, {
        permission: 1,
        note: "Thanks for the delivery",
      }),
    ).resolves.toEqual(attachment);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/users/me/shares/${attachment.txHash}`),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ permission: 1, note: "Thanks for the delivery" }),
      }),
    );
  });

  it("normalizes a private-share 404 to no attachment", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response(null, 404));
    await expect(getSendShare(`0x${"11".repeat(32)}`)).resolves.toBeNull();
  });

  it("returns only the attachment fields supplied by Core", async () => {
    const attachment = {
      id: 1,
      trackingId: "tracking-1",
      txHash: `0x${"11".repeat(32)}`,
      permission: 1,
      note: "Hello",
      createdAt: "2026-08-04T12:00:00Z",
      sharedBy: { name: "Alice", email: "alice@example.com" },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response(attachment));

    await expect(getSendShare(attachment.txHash)).resolves.toEqual(attachment);
  });
});
