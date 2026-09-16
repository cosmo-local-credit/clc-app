import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "../../client/errors";
import {
  StorageApiError,
  createImageUploadClient,
  isRetryableStorageError,
  isStorageUnauthorized,
} from "./client";
import { IMAGE_POLICIES, MAX_UPLOAD_BYTES, checkImageFile } from "./policy";

const storage = createImageUploadClient({ baseUrl: "https://storage.test/" });

function jpeg(bytes = 64): File {
  return new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });
}

function respond(options: {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}) {
  const status = options.status ?? 200;
  const text = options.text !== undefined ? options.text : JSON.stringify(options.body ?? {});
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: "",
    headers: { get: (name: string) => options.headers?.[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(text),
  });
}

const okBody = {
  ok: true,
  payload: {
    s3: "https://content.test/report/abc_1280_a3f91c2e.webp",
    width: 1280,
    height: 853,
    byteSize: 82972,
    contentType: "image/webp",
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request shape", () => {
  it("sends exactly the four fields the service reads, resolved from the purpose", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    await storage.upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://storage.test/v1/upload");
    const form = init.body as FormData;
    expect([...form.keys()].sort()).toEqual(["file", "folder", "name", "width"]);
    expect(form.get("folder")).toBe("report");
    expect(form.get("width")).toBe("1280");
    expect(form.get("name")).toBe("abc");
  });

  it("maps each purpose to its own folder and width", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    for (const [purpose, folder, width] of [
      ["profile.avatar", "profile", "400"],
      ["voucher.icon", "voucher", "400"],
      ["voucher.banner", "voucher", "1280"],
      ["pool.image", "pool", "400"],
      ["pool.banner", "pool", "1280"],
      ["report.image", "report", "1280"],
      ["offering.photo", "offering", "800"],
    ] as const) {
      await storage.upload({ file: jpeg(), purpose, uploadId: "abc" }, "tok");
      const form = fetchMock.mock.calls.at(-1)?.[1].body as FormData;
      expect([form.get("folder"), form.get("width")]).toEqual([folder, width]);
    }
  });

  // An offering photo is framed square before upload, like a pool logo, because
  // every surface that shows one frames it square. The service itself never
  // crops, so the aspect is a client-side promise the pickers have to keep.
  it("uploads an offering photo at 800px, cropped square", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    await storage.upload({ file: jpeg(), purpose: "offering.photo", uploadId: "abc" }, "tok");

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("folder")).toBe("offering");
    expect(form.get("width")).toBe("800");
    // The service reads exactly four fields; the aspect is never one of them.
    expect([...form.keys()].sort()).toEqual(["file", "folder", "name", "width"]);
    expect(IMAGE_POLICIES["offering.photo"].aspect).toBe(1);
  });

  // Square is not the same question as round. Both are cropped 1:1; only the
  // preview differs, and a photograph of a thing is not an identity mark.
  it("previews identity marks as circles and a product photo as a square", () => {
    for (const purpose of ["profile.avatar", "voucher.icon", "pool.image"] as const) {
      expect(IMAGE_POLICIES[purpose]).toMatchObject({ aspect: 1, preview: "circle" });
    }
    expect(IMAGE_POLICIES["offering.photo"].preview).toBeUndefined();
  });

  it("leaves Content-Type unset so the browser writes its own boundary", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    await storage.upload({ file: jpeg(), purpose: "voucher.icon", uploadId: "abc" }, "tok");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(headers)).toEqual(["Authorization"]);
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("sends no cookies: the token is the credential", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    await storage.upload({ file: jpeg(), purpose: "voucher.icon", uploadId: "abc" }, "tok");

    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });

  it("reuses one object key when a retry reuses the upload id", async () => {
    const fetchMock = respond({ body: okBody });
    vi.stubGlobal("fetch", fetchMock);

    const input = { file: jpeg(), purpose: "report.image", uploadId: "stable-id" } as const;
    await storage.upload(input, "tok");
    await storage.upload(input, "tok");

    const names = fetchMock.mock.calls.map((call) => (call[1].body as FormData).get("name"));
    expect(names).toEqual(["stable-id", "stable-id"]);
  });
});

describe("response normalization", () => {
  it("renames s3 to url and keeps the stored object's metadata", async () => {
    vi.stubGlobal("fetch", respond({ body: okBody }));

    const uploaded = await storage.upload(
      { file: jpeg(), purpose: "report.image", uploadId: "abc" },
      "tok",
    );

    expect(uploaded).toEqual({
      url: "https://content.test/report/abc_1280_a3f91c2e.webp",
      width: 1280,
      height: 853,
      byteSize: 82972,
      contentType: "image/webp",
    });
  });

  it("reports unknown dimensions as zero when a deployment answers with s3 alone", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ body: { ok: true, payload: { s3: "https://content.test/a.webp" } } }),
    );

    const uploaded = await storage.upload(
      { file: jpeg(512), purpose: "report.image", uploadId: "abc" },
      "tok",
    );

    expect([uploaded.width, uploaded.height]).toEqual([0, 0]);
    expect(uploaded.byteSize).toBe(512);
  });

  it("treats a 2xx with no object URL as a protocol failure, not a success", async () => {
    vi.stubGlobal("fetch", respond({ body: { ok: true, payload: {} } }));

    await expect(
      storage.upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok"),
    ).rejects.toMatchObject({ kind: "protocol" });
  });
});

describe("failure classification", () => {
  it("does not extend BackendApiError, so neither app reads it as session expiry", async () => {
    vi.stubGlobal("fetch", respond({ status: 401, body: { ok: false, code: "UNAUTHORIZED" } }));

    const error = await storage
      .upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok")
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StorageApiError);
    expect(error).not.toBeInstanceOf(BackendApiError);
    expect(isStorageUnauthorized(error)).toBe(true);
    expect(isRetryableStorageError(error)).toBe(false);
  });

  it("classifies by what the service actually returns, not by the usual status reading", async () => {
    for (const [status, code, retryable] of [
      // An unsupported container and an over-cap pixel count are both 400 here,
      // never 415 or 413, and no network change fixes either.
      [400, "UNSUPPORTED_FILE_EXTENSION", false],
      [400, "IMAGE_TOO_LARGE", false],
      [400, "INVALID_WIDTH", false],
      [413, "FILE_SIZE_LIMIT_EXCEEDED", false],
      [408, "DEADLINE_EXCEEDED", true],
      [500, "INTERNAL_SERVER_ERROR", true],
      [502, undefined, true],
    ] as const) {
      vi.stubGlobal("fetch", respond({ status, body: { ok: false, code } }));

      const error = await storage
        .upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok")
        .catch((err: unknown) => err);

      expect(isRetryableStorageError(error), `status ${status} ${code}`).toBe(retryable);
      expect((error as StorageApiError).status).toBe(status);
      expect((error as StorageApiError).code).toBe(code);
    }
  });

  it("treats a dropped request as retryable and carries Retry-After when a proxy sets one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await storage
      .upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok")
      .catch((err: unknown) => err);

    expect(isRetryableStorageError(error)).toBe(true);
    expect((error as StorageApiError).status).toBe(0);

    vi.stubGlobal(
      "fetch",
      respond({ status: 503, body: { ok: false }, headers: { "retry-after": "3" } }),
    );
    const throttled = await storage
      .upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok")
      .catch((err: unknown) => err);
    expect((throttled as StorageApiError).retryAfterMs).toBe(3000);
  });

  it("passes an abort through unchanged rather than reporting a failure", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(
      storage.upload({ file: jpeg(), purpose: "report.image", uploadId: "abc" }, "tok"),
    ).rejects.toBe(abort);
  });

  it("refuses to build a client without a storage URL", () => {
    expect(() => createImageUploadClient({ baseUrl: "" })).toThrow(
      /storage-server base URL is missing/,
    );
  });
});

describe("checkImageFile", () => {
  it("accepts the three containers the service can decode", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkImageFile({ type, size: 1024 })).toEqual({ ok: true, contentType: type });
    }
  });

  it("rejects HEIC before it reaches the network", () => {
    expect(checkImageFile({ type: "image/heic", size: 1024 })).toEqual({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("rejects a body the service would refuse with a 413", () => {
    expect(checkImageFile({ type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 })).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(checkImageFile({ type: "image/jpeg", size: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });

  it("leaves room for the multipart envelope inside the service's request limit", () => {
    // BodyLimit applies to the whole request, so the file cannot use all 8 MiB:
    // an 8 MiB file plus boundaries and part headers is a 413.
    const requestLimit = 8 * 1024 * 1024;
    expect(MAX_UPLOAD_BYTES).toBeLessThan(requestLimit);
    expect(checkImageFile({ type: "image/jpeg", size: requestLimit }).ok).toBe(false);
  });
});
