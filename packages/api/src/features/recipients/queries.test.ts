import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "../../client/errors";
import type { createRecipientsClient } from "./client";
import {
  recipientKeys,
  recipientReverseQueryOptions,
  recipientSearchQueryOptions,
} from "./queries";

type RecipientsClient = ReturnType<typeof createRecipientsClient>;

function clientWithReverse(reverse: RecipientsClient["reverse"]): RecipientsClient {
  return {
    reverse,
    resolve: vi.fn(),
    search: vi.fn(),
    suggest: vi.fn(),
  };
}

describe("recipient query options", () => {
  it("uses canonical search and case-insensitive reverse keys", () => {
    const recipients = clientWithReverse(vi.fn());

    expect(recipientSearchQueryOptions(recipients, "alice", "user").queryKey).toEqual(
      recipientKeys.search("alice", "user"),
    );
    expect(recipientKeys.reverse("0xAbC")).toEqual(recipientKeys.reverse("0xabc"));
  });

  it("treats a missing reverse identity as null and caches it for 60 seconds", async () => {
    const reverse = vi.fn().mockRejectedValue(new BackendApiError(404, "not found"));
    const recipients = clientWithReverse(reverse);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = recipientReverseQueryOptions(
      recipients,
      "0x1111111111111111111111111111111111111111",
    );

    await expect(queryClient.fetchQuery(options)).resolves.toBeNull();
    await expect(queryClient.fetchQuery(options)).resolves.toBeNull();
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(options.staleTime).toBe(60_000);
  });

  it("does not hide reverse lookup failures other than 404", async () => {
    const reverse = vi.fn().mockRejectedValue(new BackendApiError(500, "unavailable"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(
      queryClient.fetchQuery(
        recipientReverseQueryOptions(
          clientWithReverse(reverse),
          "0x1111111111111111111111111111111111111111",
        ),
      ),
    ).rejects.toThrow("unavailable");
  });
});
