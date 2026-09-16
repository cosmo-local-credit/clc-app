import { describe, expect, it } from "vite-plus/test";

import { poolKeys } from "../pools/queries";
import type { AdminClient } from "./client";
import { accountPoolsQueryOptions } from "./queries";

describe("accountPoolsQueryOptions", () => {
  it("keeps account memberships in the pool key family", () => {
    const params = { perPage: 25, cursor: 9, next: true };
    const options = accountPoolsQueryOptions({} as AdminClient, "0xAbC", params);

    expect(options.queryKey).toEqual(poolKeys.account("0xAbC", params));
  });
});
