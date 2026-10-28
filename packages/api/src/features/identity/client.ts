import type { HttpClient } from "../../client/http-client";

export type IdentityFieldAvailability = {
  available: boolean;
};

/** Only the fields that were asked about are present. */
export type IdentityAvailability = {
  email?: IdentityFieldAvailability;
  phone?: IdentityFieldAvailability;
  username?: IdentityFieldAvailability;
};

export type IdentityAvailabilityQuery = {
  email?: string;
  phone?: string;
  username?: string;
};

/**
 * Advisory occupancy for an email, phone, or username. Nothing is reserved —
 * signup and profile save repeat the check. An answer that cannot be read is
 * not reported as taken.
 */
export function createIdentityClient(http: HttpClient) {
  return {
    async getAvailability(
      query: IdentityAvailabilityQuery,
      init?: { signal?: AbortSignal },
    ): Promise<IdentityAvailability> {
      const search = new URLSearchParams();
      const email = query.email?.trim().toLowerCase();
      const phone = query.phone?.trim();
      const username = query.username?.trim().normalize("NFC");
      if (email) search.set("email", email);
      if (phone) search.set("phone", phone);
      if (username) search.set("username", username);
      if ([...search.keys()].length === 0) {
        throw new Error("An email, phone, or username to check is required.");
      }

      const result = await http.request<Record<string, unknown>>(
        `/api/v2/identity/availability?${search}`,
        { method: "GET", cache: "no-store", signal: init?.signal },
      );
      return {
        email: readField(result.email),
        phone: readField(result.phone),
        username: readField(result.username),
      };
    },
  };
}

function readField(value: unknown): IdentityFieldAvailability | undefined {
  if (value == null || typeof value !== "object") return undefined;
  return { available: (value as { available?: unknown }).available !== false };
}
