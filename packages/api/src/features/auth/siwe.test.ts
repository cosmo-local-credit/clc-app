import { describe, expect, it, vi } from "vite-plus/test";
import { parseSiweMessage } from "viem/siwe";

import type { AuthClient, SigninResult } from "./client";
import { signInWithSiwe, signSiweMessage, type SiweRequest } from "./siwe";

const SIGNER_ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645" as const;
const SIGNATURE = `0x${"ab".repeat(65)}` as const;

const request: SiweRequest = {
  domain: "localhost:3001",
  uri: "http://localhost:3001",
  chainId: 42220,
  statement: "Sign in to the CLC admin console",
};

function authStub(overrides: Partial<AuthClient> = {}) {
  return {
    getSiweNonce: vi.fn(() => Promise.resolve("nonce123")),
    signinWithSiwe: vi.fn(() => Promise.resolve<SigninResult>({ userId: 7, role: "SUPERADMIN" })),
    ...overrides,
  } as unknown as AuthClient & {
    getSiweNonce: ReturnType<typeof vi.fn>;
    signinWithSiwe: ReturnType<typeof vi.fn>;
  };
}

function signerStub() {
  return {
    address: SIGNER_ADDRESS,
    signMessage: vi.fn(() => Promise.resolve(SIGNATURE)),
  };
}

describe("signSiweMessage", () => {
  it("signs a message carrying the fetched nonce and the caller's origin", async () => {
    const auth = authStub();
    const signer = signerStub();

    const { message, signature } = await signSiweMessage(auth, signer, request);

    expect(signature).toBe(SIGNATURE);
    // Parsed rather than string-matched: the backend parses these fields out of
    // the message, so the assertion should fail for the same reasons it would.
    const parsed = parseSiweMessage(message);
    expect(parsed.nonce).toBe("nonce123");
    expect(parsed.address).toBe(SIGNER_ADDRESS);
    expect(parsed.domain).toBe("localhost:3001");
    expect(parsed.uri).toBe("http://localhost:3001");
    expect(parsed.chainId).toBe(42220);
    expect(parsed.statement).toBe("Sign in to the CLC admin console");
    expect(parsed.version).toBe("1");
  });

  it("signs the exact message it returns", async () => {
    const auth = authStub();
    const signer = signerStub();

    const { message } = await signSiweMessage(auth, signer, request);

    // A mismatch here means the backend recovers a different address than the
    // one the message claims, which it rejects as an address mismatch.
    expect(signer.signMessage).toHaveBeenCalledWith(message);
  });

  it("requests exactly one nonce, because the backend consumes it", async () => {
    const auth = authStub();

    await signSiweMessage(auth, signerStub(), request);

    expect(auth.getSiweNonce).toHaveBeenCalledTimes(1);
  });
});

describe("signInWithSiwe", () => {
  it("posts the signed message and returns the session result", async () => {
    const auth = authStub();

    const result = await signInWithSiwe(auth, signerStub(), request);

    expect(result).toEqual({ userId: 7, role: "SUPERADMIN" });
    expect(auth.signinWithSiwe).toHaveBeenCalledWith({
      message: expect.stringContaining("nonce123"),
      signature: SIGNATURE,
    });
  });

  it("does not post when signing fails", async () => {
    const auth = authStub();
    const signer = {
      address: SIGNER_ADDRESS,
      signMessage: vi.fn(() => Promise.reject(new Error("user rejected"))),
    };

    await expect(signInWithSiwe(auth, signer, request)).rejects.toThrow("user rejected");
    expect(auth.signinWithSiwe).not.toHaveBeenCalled();
  });

  it("propagates the backend rejection rather than swallowing it", async () => {
    const auth = authStub({
      signinWithSiwe: vi.fn(() => Promise.reject(new Error("address not registered"))),
    });

    await expect(signInWithSiwe(auth, signerStub(), request)).rejects.toThrow(
      "address not registered",
    );
  });
});
