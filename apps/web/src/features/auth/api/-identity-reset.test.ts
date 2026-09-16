import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearPrivateKey, getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import {
  clearInMemoryDrafts,
  clearIdentitySecrets,
  clearScopedQueries,
} from "#/features/auth/api/identity-reset";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { getWebAuthnCredential, storeWebAuthnCredential } from "#/lib/webauthn-storage";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const CREDENTIAL = {
  credentialId: "credential-1",
  keyHash: "0xhash" as const,
  publicKeyX: "0x1",
  publicKeyY: "0x2",
  address: "0xa316408425cf17f1827483dee621c6c3a9b5fad4" as const,
};

beforeEach(() => {
  localStorage.clear();
  clearPrivateKey();
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
});

describe("clearIdentitySecrets", () => {
  // The leak: each connector's `disconnect` only cleared its own slot, so a
  // paper-wallet sign-out left behind a passkey registered mid-session and the
  // next person was offered a sign-in that authenticates as the previous one.
  it("clears both credentials on a teardown", () => {
    storePrivateKey(KEY);
    storeWebAuthnCredential(CREDENTIAL);

    clearIdentitySecrets("none");

    expect(getStoredKey()).toBeNull();
    expect(localStorage.getItem("clc_pk_connected")).toBeNull();
    expect(localStorage.getItem("clc_pk_address")).toBeNull();
    expect(getWebAuthnCredential()).toBeNull();
  });

  it("keeps the private key a paper-wallet sign-in just wrote", () => {
    storePrivateKey(KEY);
    storeWebAuthnCredential(CREDENTIAL);

    clearIdentitySecrets("private-key");

    expect(getStoredKey()).toBe(KEY);
    expect(getWebAuthnCredential()).toBeNull();
  });

  it("keeps the passkey a passkey sign-in just minted", () => {
    storePrivateKey(KEY);
    storeWebAuthnCredential(CREDENTIAL);

    clearIdentitySecrets("webauthn");

    expect(getStoredKey()).toBeNull();
    expect(getWebAuthnCredential()).toMatchObject({ credentialId: "credential-1" });
  });

  it("does not throw when the store is unreachable, so sign-out still proceeds", () => {
    const real = localStorage;
    try {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("denied", "SecurityError");
        },
      });
      expect(() => clearIdentitySecrets("none")).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: real });
    }
  });
});

describe("clearScopedQueries", () => {
  it("removes backend and address-book reads but keeps the session query", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["clc", "accounts", "tokens", "0xalice"], ["token"]);
    queryClient.setQueryData(["address-book", "0xalice", "recipients"], ["recipient"]);
    queryClient.setQueryData(["auth", "session", "0xalice"], { address: "0xalice" });

    clearScopedQueries(queryClient);

    expect(queryClient.getQueryData(["clc", "accounts", "tokens", "0xalice"])).toBeUndefined();
    expect(queryClient.getQueryData(["address-book", "0xalice", "recipients"])).toBeUndefined();
    // Outside both prefixes on purpose: the data goes, the session can still be
    // re-read so the incoming user is resolved.
    expect(queryClient.getQueryData(["auth", "session", "0xalice"])).toEqual({
      address: "0xalice",
    });
  });

  it("removes rather than invalidates, so nothing is served while refetching", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["clc", "pools", "detail", "0xpool"], { name: "Kilifi" });

    clearScopedQueries(queryClient);

    expect(
      queryClient.getQueryCache().find({ queryKey: ["clc", "pools", "detail", "0xpool"] }),
    ).toBeUndefined();
  });
});

describe("clearInMemoryDrafts", () => {
  // Never persisted, so these looked safe — but sign-out does not reload, so the
  // store outlives the session and the next person opens a prefilled form.
  it("drops a previous account's half-written pool and voucher", () => {
    usePoolCreateDraft.getState().setDraft({ name: "Kilifi Growers" } as never);
    useVoucherCreateDraft.getState().setDraft({ name: "Maize Credit" } as never);

    clearInMemoryDrafts();

    expect(usePoolCreateDraft.getState().draft).toBeNull();
    expect(useVoucherCreateDraft.getState().draft).toBeNull();
  });
});
