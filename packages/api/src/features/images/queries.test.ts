import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "../../client/errors";
import type { AuthClient } from "../auth/client";
import { authKeys } from "../auth/queries";
import { reportKeys } from "../reports/queries";
import { StorageApiError, type ImageUploadClient, type UploadedImage } from "./client";
import { imageKeys, storageTokenQueryOptions, uploadImageMutationOptions } from "./queries";

const IDENTITY = "0xAbCdEf0000000000000000000000000000000001";

const uploaded: UploadedImage = {
  url: "https://content.test/report/abc_1280_a3f91c2e.webp",
  width: 1280,
  height: 853,
  byteSize: 82972,
  contentType: "image/webp",
};

// The spies are returned alongside the stub so assertions read a local function
// rather than a property off the client, which would be an unbound method.
function authStub(tokens: string[] = ["tok-1", "tok-2"]) {
  let call = 0;
  const getStorageToken = vi.fn(async () => ({
    token: tokens[Math.min(call++, tokens.length - 1)] ?? "tok",
    expiresAt: "2026-09-19T10:00:00Z",
  }));
  return { auth: { getStorageToken } as unknown as AuthClient, getStorageToken };
}

function storageStub(impl: ImageUploadClient["upload"]) {
  const upload = vi.fn(impl);
  return { storage: { baseUrl: "https://storage.test", upload }, upload };
}

function unauthorized() {
  return new StorageApiError(401, "UNAUTHORIZED", "UNAUTHORIZED", { kind: "unauthorized" });
}

async function run(
  client: QueryClient,
  auth: AuthClient,
  storage: ImageUploadClient,
): Promise<UploadedImage> {
  const { mutationFn, mutationKey } = uploadImageMutationOptions(auth, storage, IDENTITY);
  if (!mutationFn) throw new Error("uploadImageMutationOptions must define a mutationFn");

  const input = {
    file: new File([new Uint8Array(8)], "photo.jpg", { type: "image/jpeg" }),
    purpose: "report.image" as const,
    uploadId: "abc",
  };
  // Called the way useMutation calls it: variables plus the mutation context.
  return mutationFn(input, { client, meta: undefined, mutationKey });
}

describe("imageKeys", () => {
  it("hangs off the shared clc prefix so an identity sweep collects it", () => {
    expect(imageKeys.token(IDENTITY)[0]).toBe("clc");
    expect(imageKeys.all).toEqual(["clc", "images"]);
  });

  it("keys by address case-insensitively, so one session has one entry", () => {
    expect(imageKeys.token(IDENTITY)).toEqual(imageKeys.token(IDENTITY.toLowerCase()));
  });
});

describe("storageTokenQueryOptions", () => {
  it("marks the entry sensitive and never lets it go stale on a timer", () => {
    const options = storageTokenQueryOptions(authStub().auth, IDENTITY);

    expect(options.meta).toEqual({ sensitive: true });
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY);
  });

  it("retries a transport failure once and gives up on a rejected session", () => {
    const options = storageTokenQueryOptions(authStub().auth, IDENTITY);
    const retry = options.retry as (count: number, error: unknown) => boolean;

    expect(retry(0, new BackendApiError(0, "offline", undefined, { kind: "network" }))).toBe(true);
    expect(retry(1, new BackendApiError(0, "offline", undefined, { kind: "network" }))).toBe(false);
    expect(retry(0, new BackendApiError(401, "expired", "E06"))).toBe(false);
  });
});

describe("uploadImageMutationOptions", () => {
  it("reads the token once and shares it across simultaneous uploads", async () => {
    const client = new QueryClient();
    const { auth, getStorageToken } = authStub();
    const { storage, upload } = storageStub(async () => uploaded);

    await Promise.all([run(client, auth, storage), run(client, auth, storage)]);

    expect(getStorageToken).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(expect.anything(), "tok-1");
  });

  it("drops the cached token on a 401, re-reads it, and retries that upload once", async () => {
    const client = new QueryClient();
    const { auth, getStorageToken } = authStub(["stale", "fresh"]);
    let attempt = 0;
    const { storage, upload } = storageStub(async () => {
      attempt += 1;
      if (attempt === 1) throw unauthorized();
      return uploaded;
    });

    await expect(run(client, auth, storage)).resolves.toEqual(uploaded);

    expect(getStorageToken).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenNthCalledWith(1, expect.anything(), "stale");
    expect(upload).toHaveBeenNthCalledWith(2, expect.anything(), "fresh");
    expect(client.getQueryData(imageKeys.token(IDENTITY))).toMatchObject({ token: "fresh" });
  });

  it("surfaces a second 401 instead of re-reading the token forever", async () => {
    const client = new QueryClient();
    const { auth, getStorageToken } = authStub();
    const { storage, upload } = storageStub(async () => {
      throw unauthorized();
    });

    await expect(run(client, auth, storage)).rejects.toBeInstanceOf(StorageApiError);
    expect(getStorageToken).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("does not re-read the token for a failure that is not a 401", async () => {
    const client = new QueryClient();
    const { auth, getStorageToken } = authStub();
    const { storage, upload } = storageStub(async () => {
      throw new StorageApiError(400, "IMAGE_TOO_LARGE", "IMAGE_TOO_LARGE", { kind: "rejected" });
    });

    await expect(run(client, auth, storage)).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(getStorageToken).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("retries only what a second attempt can fix", () => {
    const options = uploadImageMutationOptions(
      authStub().auth,
      storageStub(async () => uploaded).storage,
      IDENTITY,
    );
    const retry = options.retry as (count: number, error: unknown) => boolean;

    expect(retry(0, new StorageApiError(503, "down", undefined, { kind: "server" }))).toBe(true);
    expect(retry(1, new StorageApiError(503, "down", undefined, { kind: "server" }))).toBe(false);
    expect(retry(0, new StorageApiError(400, "bad", "INVALID_WIDTH", { kind: "rejected" }))).toBe(
      false,
    );
    expect(retry(0, unauthorized())).toBe(false);
  });

  it("touches no domain cache: a stored object is not yet part of any entity", async () => {
    const client = new QueryClient();
    client.setQueryData(reportKeys.detail("7"), { id: "7", title: "unchanged" });
    client.setQueryData(authKeys.profile(IDENTITY), { address: IDENTITY, name: "unchanged" });

    await run(client, authStub().auth, storageStub(async () => uploaded).storage);

    expect(client.getQueryData(reportKeys.detail("7"))).toEqual({ id: "7", title: "unchanged" });
    expect(client.getQueryData(authKeys.profile(IDENTITY))).toEqual({
      address: IDENTITY,
      name: "unchanged",
    });
  });

  it("will not fire while offline rather than queueing a File it cannot persist", () => {
    const options = uploadImageMutationOptions(
      authStub().auth,
      storageStub(async () => uploaded).storage,
      IDENTITY,
    );

    expect(options.networkMode).toBe("online");
  });
});
