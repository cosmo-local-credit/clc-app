import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createAccountRetirementClient } from "./client";
import {
  accountRetirementKeys,
  accountRetirementPreviewQueryOptions,
  adminAccountRetirementQueryOptions,
  moderationHistoryQueryOptions,
} from "./queries";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const api = createAccountRetirementClient(createHttpClient({ baseUrl: "https://api.test" }));
const state = {
  accountLifecycle: "RETIREMENT_SCHEDULED",
  closesAt: "2027-05-11T00:00:00Z",
  capabilities: {
    canUseApp: false,
    canRecoverAssets: true,
    canTransferResources: true,
    canRestoreAccount: true,
  },
  retirement: {
    id: 1,
    state: "RETIREMENT_SCHEDULED",
    requestedAt: "2026-11-11T00:00:00Z",
    closesAt: "2027-05-11T00:00:00Z",
    reason: "",
    requestSource: "SELF",
    restoredAt: null,
    version: 1,
  },
};
const preview = {
  closesAt: "2027-05-11T00:00:00Z",
  recoveryMonths: 6,
  ownedResources: [],
  pendingResourceRequests: 0,
  hiddenContent: { wants: 0, catalogs: 0, posts: 0, reviews: 0 },
  balancesCoverage: "unavailable",
  balancesCoverageNote: "Check your wallet",
  pendingOperationsNote: "Sent transactions cannot be recalled",
};

function respond(result: unknown) {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, result }),
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("account retirement client", () => {
  it("reads the preview uncached", async () => {
    const fetcher = respond({ preview });
    expect((await api.preview()).recoveryMonths).toBe(6);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/users/me/retirement/preview",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
  });

  it("retires with the acknowledgement and an optional reason", async () => {
    const fetcher = respond(state);
    const result = await api.retire({ acknowledged: true, reason: "moving away" });
    expect(result.accountLifecycle).toBe("RETIREMENT_SCHEDULED");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/api/v2/users/me/retirement",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ acknowledged: true, reason: "moving away" }),
      }),
    );
  });

  it("restores without a body", async () => {
    const fetcher = respond({
      ...state,
      accountLifecycle: "ACTIVE",
      closesAt: null,
      retirement: null,
    });
    expect((await api.restore()).accountLifecycle).toBe("ACTIVE");
    const [, init] = fetcher.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("rejects a malformed lifecycle instead of guessing", async () => {
    respond({ ...state, accountLifecycle: "SOMETHING" });
    await expect(api.restore()).rejects.toThrow();
  });

  it("reads and acts on an account as an operator", async () => {
    const fetcher = respond({ ...state, events: null, preview });
    const read = await api.adminGet(ADDRESS);
    expect(read.events).toEqual([]);
    expect(fetcher).toHaveBeenLastCalledWith(
      `https://api.test/api/v2/admin/users/${ADDRESS}/retirement`,
      expect.objectContaining({ method: "GET" }),
    );

    respond(state);
    await api.adminRetire(ADDRESS, { reason: "requested" });
    respond({ ...state, accountLifecycle: "ACTIVE", closesAt: null, retirement: null });
    await api.adminRestore(ADDRESS);
  });

  it("lists moderation history, treating null as empty", async () => {
    respond({ events: null });
    expect(await api.moderationHistory(ADDRESS)).toEqual([]);
    respond({
      events: [
        {
          id: 1,
          action: "ban",
          previousStatus: "APPROVED",
          newStatus: "REJECTED",
          reason: "spam",
          actorAddress: ADDRESS,
          createdAt: "2026-11-11T00:00:00Z",
        },
      ],
    });
    expect((await api.moderationHistory(ADDRESS))[0]?.action).toBe("ban");
  });
});

describe("account retirement queries", () => {
  it("scopes the preview key to the wallet, case-insensitively, and never caches it", () => {
    const options = accountRetirementPreviewQueryOptions(
      api,
      ADDRESS.toUpperCase().replace("0X", "0x"),
    );
    expect(options.queryKey).toEqual(accountRetirementKeys.preview(ADDRESS));
    expect(options.gcTime).toBe(0);
    expect(accountRetirementPreviewQueryOptions(api, "").enabled).toBe(false);
  });

  it("keys operator reads by account", () => {
    expect(adminAccountRetirementQueryOptions(api, ADDRESS).queryKey).toEqual(
      accountRetirementKeys.admin(ADDRESS),
    );
    expect(moderationHistoryQueryOptions(api, ADDRESS).queryKey).toEqual(
      accountRetirementKeys.moderation(ADDRESS),
    );
    expect(adminAccountRetirementQueryOptions(api, "").enabled).toBe(false);
  });
});
