import type { HttpClient } from "../../client/http-client";

export type RecipientIdentity = {
  kind: "user" | "pool";
  name: string;
  alias: string;
  address: `0x${string}`;
  chainId: number;
};

export function recipientLabel(recipient: RecipientIdentity): string {
  return recipient.name === recipient.alias
    ? recipient.name
    : `${recipient.name} (${recipient.alias})`;
}

export function createRecipientsClient(http: HttpClient) {
  return {
    async search(query: string, kind?: "user" | "pool", signal?: AbortSignal) {
      const params = new URLSearchParams({ q: query });
      if (kind) params.set("kind", kind);
      const result = await http.request<unknown>(`/api/v2/recipients?${params}`, {
        method: "GET",
        signal,
        cache: "no-store",
      });
      if (!isRecord(result) || !Array.isArray(result.recipients)) {
        throw new Error("Invalid recipient search response");
      }
      return result.recipients.filter(isRecipientIdentity);
    },
    async resolve(name: string, signal?: AbortSignal) {
      const result = await http.request<unknown>(
        `/api/v2/recipients/resolve?${new URLSearchParams({ name })}`,
        { method: "GET", signal, cache: "no-store" },
      );
      if (!isRecord(result) || !isRecipientIdentity(result.recipient)) {
        throw new Error("Invalid recipient response");
      }
      return result.recipient;
    },
    async reverse(address: string, signal?: AbortSignal) {
      const result = await http.request<unknown>(
        `/api/v2/recipients/reverse/${encodeURIComponent(address)}`,
        { method: "GET", signal, cache: "no-store" },
      );
      if (!isRecord(result) || !isRecipientIdentity(result.recipient)) {
        throw new Error("Invalid recipient response");
      }
      return result.recipient;
    },
    async suggest(hint: string, signal?: AbortSignal) {
      const result = await http.request<unknown>(
        `/api/v2/recipients/suggest?${new URLSearchParams({ hint })}`,
        { method: "GET", signal, cache: "no-store" },
      );
      if (!isRecord(result) || !isUsername(result.username)) {
        throw new Error("Invalid username suggestion response");
      }
      return result.username;
    },
  };
}

function isUsername(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Array.from(value).length <= 80;
}

function isRecipientIdentity(value: unknown): value is RecipientIdentity {
  if (!isRecord(value)) return false;
  return (
    (value.kind === "user" || value.kind === "pool") &&
    typeof value.name === "string" &&
    value.name.trim() !== "" &&
    typeof value.alias === "string" &&
    value.alias.trim() !== "" &&
    typeof value.address === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(value.address) &&
    typeof value.chainId === "number" &&
    Number.isSafeInteger(value.chainId) &&
    value.chainId >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
