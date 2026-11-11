import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import { describe, expect, it } from "vite-plus/test";

import {
  isAccountRetiredError,
  isRecoveryPath,
  isRecoverySession,
  lifecycleRedirect,
  resolveAccountLifecycle,
} from "./lifecycle";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const CLOSES_AT = "2027-05-11T10:00:00Z";
const RECOVERY = {
  canUseApp: false,
  canRecoverAssets: true,
  canTransferResources: true,
  canRestoreAccount: true,
};

type Input = Parameters<typeof resolveAccountLifecycle>[0];

function auth(state: Input["state"], session?: Partial<SessionResult> | null): Input {
  return {
    state,
    address: ADDRESS,
    session:
      session === null
        ? null
        : session
          ? { address: ADDRESS, chainId: 100, ...session }
          : undefined,
  };
}

const retiring = auth("authenticated", {
  accountLifecycle: "RETIREMENT_SCHEDULED",
  closesAt: CLOSES_AT,
  capabilities: RECOVERY,
});

describe("resolveAccountLifecycle", () => {
  it("reads an absent lifecycle as active with full capabilities", () => {
    expect(resolveAccountLifecycle(auth("authenticated", {}))).toEqual({
      known: true,
      lifecycle: "ACTIVE",
      closesAt: null,
      capabilities: expect.objectContaining({ canUseApp: true, canRestoreAccount: false }),
    });
  });

  it("carries the closing date and capabilities of a retiring account", () => {
    expect(resolveAccountLifecycle(retiring)).toEqual({
      known: true,
      lifecycle: "RETIREMENT_SCHEDULED",
      closesAt: CLOSES_AT,
      capabilities: RECOVERY,
    });
  });

  it("grants nothing to a restricted account whose capabilities the backend omitted", () => {
    const view = resolveAccountLifecycle(
      auth("authenticated", { accountLifecycle: "ERASURE_PENDING" }),
    );
    expect(view).toMatchObject({
      known: true,
      capabilities: {
        canUseApp: false,
        canRecoverAssets: false,
        canTransferResources: false,
        canRestoreAccount: false,
      },
    });
  });

  it("keeps the last answer through a failed re-check but not without one", () => {
    expect(
      resolveAccountLifecycle(
        auth("sessionCheckError", { accountLifecycle: "RETIREMENT_SCHEDULED" }),
      ).known,
    ).toBe(true);
    expect(resolveAccountLifecycle(auth("sessionCheckError")).known).toBe(false);
  });

  it.each(["loading", "guest", "connectedNoSession"] as const)(
    "knows nothing while %s",
    (state) => {
      expect(resolveAccountLifecycle(auth(state, { accountLifecycle: "ACTIVE" })).known).toBe(
        false,
      );
    },
  );

  it("ignores a session that names another wallet", () => {
    const other = auth("authenticated", { address: "0x0000000000000000000000000000000000000001" });
    expect(resolveAccountLifecycle(other).known).toBe(false);
    expect(resolveAccountLifecycle({ ...retiring, address: undefined }).known).toBe(false);
  });
});

describe("isRecoverySession", () => {
  it("is true only for a known, restricted lifecycle", () => {
    expect(isRecoverySession(retiring)).toBe(true);
    expect(isRecoverySession(auth("authenticated", { accountLifecycle: "ACTIVE" }))).toBe(false);
    expect(isRecoverySession(auth("loading"))).toBe(false);
  });
});

describe("isRecoveryPath", () => {
  it("allows the shell and the wallet screens that move funds", () => {
    for (const path of [
      "/recovery",
      "/recovery/",
      "/wallet/send",
      "/wallet/send/amount",
      "/wallet/receive",
    ]) {
      expect(isRecoveryPath(path, RECOVERY), path).toBe(true);
    }
  });

  it("blocks everything else, including look-alike prefixes", () => {
    for (const path of [
      "/",
      "/market",
      "/wallet/cash",
      "/wallet/sender",
      "/settings/profile",
      "/vouchers/create/voucher",
    ]) {
      expect(isRecoveryPath(path, RECOVERY), path).toBe(false);
    }
  });

  it("allows only the shell without the capability to recover assets", () => {
    const caps = { ...RECOVERY, canRecoverAssets: false };
    expect(isRecoveryPath("/recovery", caps)).toBe(true);
    expect(isRecoveryPath("/wallet/send", caps)).toBe(false);
  });
});

describe("lifecycleRedirect", () => {
  it("sends a retiring account from a normal route to the shell", () => {
    expect(lifecycleRedirect("/", retiring)).toBe("/recovery");
    expect(lifecycleRedirect("/settings/profile", retiring)).toBe("/recovery");
  });

  it("leaves a retiring account on the recovery set", () => {
    expect(lifecycleRedirect("/recovery", retiring)).toBeNull();
    expect(lifecycleRedirect("/wallet/send/amount", retiring)).toBeNull();
  });

  it("sends an active account out of the shell and leaves its other routes alone", () => {
    const active = auth("authenticated", { accountLifecycle: "ACTIVE" });
    expect(lifecycleRedirect("/recovery", active)).toBe("/");
    expect(lifecycleRedirect("/wallet/send", active)).toBeNull();
  });

  it("sends a guest out of the shell", () => {
    expect(
      lifecycleRedirect("/recovery", { state: "guest", address: undefined, session: undefined }),
    ).toBe("/");
  });

  it("does not guess while the session is loading, expired or failed", () => {
    for (const state of ["loading", "connectedNoSession", "sessionCheckError"] as const) {
      expect(lifecycleRedirect("/", auth(state)), state).toBeNull();
      expect(lifecycleRedirect("/recovery", auth(state)), state).toBeNull();
    }
  });
});

describe("isAccountRetiredError", () => {
  it("matches only a 403 carrying E23", () => {
    expect(isAccountRetiredError(new BackendApiError(403, "retired", "E23"))).toBe(true);
    expect(isAccountRetiredError(new BackendApiError(403, "nope", "E01"))).toBe(false);
    expect(isAccountRetiredError(new BackendApiError(500, "retired", "E23"))).toBe(false);
    expect(isAccountRetiredError(new Error("E23"))).toBe(false);
  });
});
