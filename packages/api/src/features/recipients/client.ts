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
      const result = await http.request<{ recipients: RecipientIdentity[] }>(
        `/api/v2/recipients?${params}`,
        { method: "GET", signal, cache: "no-store" },
      );
      return result.recipients.filter(isRecipientIdentity);
    },
    async resolve(name: string, signal?: AbortSignal) {
      const result = await http.request<{ recipient: RecipientIdentity }>(
        `/api/v2/recipients/resolve/${encodeURIComponent(name)}`,
        { method: "GET", signal, cache: "no-store" },
      );
      if (!isRecipientIdentity(result.recipient)) throw new Error("Invalid recipient response");
      return result.recipient;
    },
    async reverse(address: string, signal?: AbortSignal) {
      const result = await http.request<{ recipient: RecipientIdentity }>(
        `/api/v2/recipients/reverse/${encodeURIComponent(address)}`,
        { method: "GET", signal, cache: "no-store" },
      );
      if (!isRecipientIdentity(result.recipient)) throw new Error("Invalid recipient response");
      return result.recipient;
    },
    async suggest(hint: string, signal?: AbortSignal) {
      const result = await http.request<{ username: string }>(
        `/api/v2/recipients/suggest?${new URLSearchParams({ hint })}`,
        { method: "GET", signal, cache: "no-store" },
      );
      return result.username;
    },
  };
}

function isRecipientIdentity(value: RecipientIdentity): boolean {
  return (
    Boolean(value) &&
    (value.kind === "user" || value.kind === "pool") &&
    typeof value.name === "string" &&
    typeof value.alias === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(value.address) &&
    Number.isSafeInteger(value.chainId) &&
    value.chainId >= 0
  );
}
