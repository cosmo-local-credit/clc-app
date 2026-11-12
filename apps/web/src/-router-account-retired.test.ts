import { BackendApiError } from "@clc/api/client/errors";
import { describe, expect, it, vi } from "vite-plus/test";

import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { getRouter } from "./router";

function queryClient() {
  return getRouter().options.context.queryClient;
}

describe("account retired refusals", () => {
  it("re-reads the session when a query is refused with E23", async () => {
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const clear = vi.spyOn(client, "removeQueries");

    await client
      .fetchQuery({
        queryKey: ["clc", "wants"],
        queryFn: () => Promise.reject(new BackendApiError(403, "retired", "E23")),
        retry: false,
      })
      .catch(() => undefined);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: authSessionQueryKey });
    // The same account: nothing it cached is another person's.
    expect(clear).not.toHaveBeenCalled();
  });

  it("re-reads the session when a mutation is refused with E23", async () => {
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new BackendApiError(403, "retired", "E23")),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: authSessionQueryKey });
  });

  it("leaves other refusals alone", async () => {
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await client
      .fetchQuery({
        queryKey: ["clc", "wants"],
        queryFn: () => Promise.reject(new BackendApiError(403, "forbidden", "E01")),
        retry: false,
      })
      .catch(() => undefined);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
