import { isAddress } from "viem";

import { apiFetch } from "#/features/auth/api/client";
import type { RecipientSearchKind } from "#/features/wallet/ui/recipient-validation";

export type RecipientSearchInput = {
  kind: RecipientSearchKind;
  query: string;
};

export type RecipientSearchOption = {
  name: string;
  address: `0x${string}`;
};

type RecipientSearchResponse = {
  users: Array<{
    name: string;
    address: string;
  }>;
};

export async function searchRecipientUsers(
  input: RecipientSearchInput,
): Promise<RecipientSearchOption[]> {
  const result = await apiFetch<RecipientSearchResponse>("/api/v2/users/search", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return result.users.map((user) => {
    if (!isAddress(user.address, { strict: false })) {
      throw new Error("Recipient search response contains an invalid address.");
    }
    return {
      name: user.name,
      address: user.address as `0x${string}`,
    };
  });
}
