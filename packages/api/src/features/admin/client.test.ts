import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { type AdminUser, createAdminClient } from "./client";

const BASE_URL = "http://localhost:5003";
const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 1,
    ethereumAddress: ADDRESS,
    name: "Superadmin",
    email: "devops@grassecon.org",
    phone: "",
    country: "",
    role: "SUPERADMIN",
    status: "APPROVED",
    maxPools: 10,
    maxTokens: 20,
    createdAt: "2026-07-24T10:43:16.051912+03:00",
    updatedAt: "2026-07-24T10:43:16.051912+03:00",
    ...overrides,
  };
}

function ok(result: unknown) {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function client() {
  return createAdminClient(createHttpClient({ baseUrl: BASE_URL, fetch: fetchMock as never }));
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock = vi.fn();
});

describe("listUsers", () => {
  it("requests every account when no status is given", async () => {
    fetchMock.mockResolvedValue(ok({ users: [user()] }));

    const users = await client().listUsers();

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users`);
    expect(users).toHaveLength(1);
  });

  it("passes the status through as a query parameter", async () => {
    fetchMock.mockResolvedValue(ok({ users: [] }));

    await client().listUsers("PENDING");

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users?status=PENDING`);
  });

  it("normalizes a null list to an empty array", async () => {
    // The backend answers `{"users": null}` for an empty filtered result, which
    // would otherwise reach the UI as a crash rather than as "no rows".
    fetchMock.mockResolvedValue(ok({ users: null }));

    await expect(client().listUsers("REJECTED")).resolves.toEqual([]);
  });
});

describe("user mutations", () => {
  it("approves by address and returns the updated row", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ status: "APPROVED" }) }));

    const updated = await client().approveUser(ADDRESS);

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/approve`);
    expect(init.method).toBe("PUT");
    expect(updated.status).toBe("APPROVED");
  });

  it("sends no body when approving, so no JSON content type is set", async () => {
    fetchMock.mockResolvedValue(ok({ user: user() }));

    await client().approveUser(ADDRESS);

    const { init } = lastCall();
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("rejects by address", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ status: "REJECTED" }) }));

    const updated = await client().rejectUser(ADDRESS);

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/reject`);
    expect(updated.status).toBe("REJECTED");
  });

  it("sends both limits, because the backend replaces rather than patches them", async () => {
    fetchMock.mockResolvedValue(ok({ user: user({ maxPools: 3, maxTokens: 7 }) }));

    const updated = await client().updateUserLimits(ADDRESS, { maxPools: 3, maxTokens: 7 });

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE_URL}/api/v2/admin/users/${ADDRESS}/limits`);
    expect(JSON.parse(init.body as string)).toEqual({ maxPools: 3, maxTokens: 7 });
    expect(updated.maxPools).toBe(3);
  });

  it("encodes the address so a malformed one cannot alter the route", async () => {
    fetchMock.mockResolvedValue(ok({ user: user() }));

    await client().approveUser("../../tokens");

    expect(lastCall().url).toBe(`${BASE_URL}/api/v2/admin/users/..%2F..%2Ftokens/approve`);
  });
});
