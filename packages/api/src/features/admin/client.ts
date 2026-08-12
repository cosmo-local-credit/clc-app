/**
 * The superadmin-only endpoints under /api/v2/admin.
 *
 * clc-core gates the whole group behind `requireSuperAdmin`, so every call here
 * fails with 403 for anyone else. That is the authorization boundary; the admin
 * console's session gate only decides what to render.
 *
 * **`/admin/users` is not paginated.** `?perPage=` and `?cursor=` are ignored —
 * the handler returns every row. Callers must present the result as the whole set
 * rather than a page of one, and must not grow a UI that implies more pages exist.
 * When the backend gains cursor parameters this is the module to change.
 *
 * `/admin/tokens`, `/admin/pools` and `/admin/deployments` also exist and are also
 * unpaginated. They are deliberately absent here until a surface needs them —
 * adding a method with no caller is how a client grows dead code.
 */

import type { HttpClient } from "../../client/http-client";

/** Approval state of an account, as clc-core stores it. */
export type AdminUserStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AdminUser = {
  id: number;
  ethereumAddress: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  role: string;
  status: string;
  maxPools: number;
  maxTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserLimits = {
  maxPools: number;
  maxTokens: number;
};

export type AdminClient = {
  /** Every account, or only those in one approval state. */
  listUsers(status?: AdminUserStatus): Promise<Array<AdminUser>>;
  approveUser(address: string): Promise<AdminUser>;
  rejectUser(address: string): Promise<AdminUser>;
  updateUserLimits(address: string, limits: AdminUserLimits): Promise<AdminUser>;
};

export function createAdminClient(http: HttpClient): AdminClient {
  /**
   * The list handlers answer with `null` rather than `[]` for an empty result —
   * `?status=PENDING` with no pending accounts does exactly this — so every list
   * is normalized here instead of at each call site.
   */
  async function list<T>(path: string, key: string): Promise<Array<T>> {
    const result = await http.request<Record<string, Array<T> | null>>(path, { method: "GET" });
    return result[key] ?? [];
  }

  /**
   * Mutations answer with the updated row, which callers write straight into the
   * cache rather than re-listing an unpaginated endpoint.
   */
  async function mutateUser(path: string, body?: AdminUserLimits): Promise<AdminUser> {
    const result = await http.request<{ user: AdminUser }>(path, {
      method: "PUT",
      // A PUT with no body must send none: the transport only sets the JSON
      // content type when a body is present.
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return result.user;
  }

  return {
    listUsers(status) {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      return list<AdminUser>(`/api/v2/admin/users${query}`, "users");
    },

    // The address goes into the path, so it must be encoded even though a valid
    // hex address needs no escaping — a malformed one must not alter the route.
    approveUser(address) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/approve`);
    },

    rejectUser(address) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/reject`);
    },

    updateUserLimits(address, limits) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/limits`, limits);
    },
  };
}
