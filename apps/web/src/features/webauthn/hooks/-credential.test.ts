import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createWebAuthnPasskey, requestWebAuthnAssertion } from "./credential";

function domError(name: string): DOMException {
  return new DOMException(
    "An unknown error occurred while talking to the credential manager",
    name,
  );
}

const fakeAssertion = { id: "cred" } as unknown as PublicKeyCredential;
const getCredential = vi.fn();
const createCredential = vi.fn();

beforeEach(() => {
  getCredential.mockReset();
  createCredential.mockReset();
  vi.stubGlobal("navigator", {
    credentials: { get: getCredential, create: createCredential },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestWebAuthnAssertion", () => {
  it("returns the assertion on success without retrying", async () => {
    getCredential.mockResolvedValueOnce(fakeAssertion);

    await expect(requestWebAuthnAssertion({})).resolves.toBe(fakeAssertion);
    expect(getCredential).toHaveBeenCalledTimes(1);
  });

  it("retries once on the transient NotReadableError and succeeds", async () => {
    getCredential
      .mockRejectedValueOnce(domError("NotReadableError"))
      .mockResolvedValueOnce(fakeAssertion);

    await expect(requestWebAuthnAssertion({})).resolves.toBe(fakeAssertion);
    expect(getCredential).toHaveBeenCalledTimes(2);
  });

  it("does not retry on NotAllowedError (user cancelled) and stays silent", async () => {
    getCredential.mockRejectedValue(domError("NotAllowedError"));

    await expect(requestWebAuthnAssertion({})).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(getCredential).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("surfaces a genuine failure to the console after the retry", async () => {
    getCredential.mockRejectedValue(domError("NotReadableError"));

    await expect(requestWebAuthnAssertion({})).rejects.toMatchObject({ name: "NotReadableError" });
    expect(getCredential).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("createWebAuthnPasskey", () => {
  it("retries once on the transient error and succeeds", async () => {
    createCredential
      .mockRejectedValueOnce(domError("UnknownError"))
      .mockResolvedValueOnce(fakeAssertion);

    await expect(createWebAuthnPasskey({})).resolves.toBe(fakeAssertion);
    expect(createCredential).toHaveBeenCalledTimes(2);
  });
});
