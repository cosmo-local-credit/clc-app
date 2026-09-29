import type { WebAuthnCredentialSummary } from "@clc/api/features/auth/client";
import { describe, expect, it } from "vite-plus/test";

import { derivePasskeyAccountStatus } from "./passkey-link-status";

const ADDRESS = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;

function row(
  credentialId: string,
  state: WebAuthnCredentialSummary["state"],
  trackingId: string | null = null,
): WebAuthnCredentialSummary {
  return { credentialId, state, createdAt: "2026-09-24T00:00:00Z", trackingId };
}

function local(credentialId: string, address: `0x${string}` = ADDRESS) {
  return {
    credentialId,
    keyHash: `0x${"aa".repeat(32)}` as const,
    publicKeyX: "1",
    publicKeyY: "2",
    address,
    stale: false,
  };
}

describe("derivePasskeyAccountStatus", () => {
  it("is available with no credentials", () => {
    expect(derivePasskeyAccountStatus(ADDRESS, [], null)).toEqual({ kind: "available" });
  });

  it("treats failed and unverified attempts as not linked", () => {
    expect(
      derivePasskeyAccountStatus(ADDRESS, [row("a", "failed"), row("b", "unverified")], null),
    ).toEqual({ kind: "available" });
  });

  it("knows the device holds the active passkey only when local storage names it", () => {
    expect(derivePasskeyAccountStatus(ADDRESS, [row("a", "active")], local("a"))).toEqual({
      kind: "linked-here",
      credentialId: "a",
    });
  });

  // The passkey is on another phone: local storage has nothing, and must not be
  // read as "unlinked".
  it("reports an account-level passkey that is not on this device", () => {
    expect(derivePasskeyAccountStatus(ADDRESS, [row("a", "active")], null)).toEqual({
      kind: "linked-elsewhere",
    });
    expect(derivePasskeyAccountStatus(ADDRESS, [row("a", "active")], local("other"))).toEqual({
      kind: "linked-elsewhere",
    });
  });

  it("never matches a local credential stored for a different wallet", () => {
    expect(
      derivePasskeyAccountStatus(
        ADDRESS,
        [row("a", "active")],
        local("a", "0x0000000000000000000000000000000000000001"),
      ),
    ).toEqual({ kind: "linked-elsewhere" });
  });

  it("does not claim a link while the registration is pending, and keeps its tracking id", () => {
    expect(derivePasskeyAccountStatus(ADDRESS, [row("a", "pending", "t-1")], local("a"))).toEqual({
      kind: "pending",
      trackingId: "t-1",
    });
  });

  it("waits on legacy rows rather than offering another link", () => {
    expect(derivePasskeyAccountStatus(ADDRESS, [row("a", "legacy")], null)).toEqual({
      kind: "verifying",
    });
  });
});
