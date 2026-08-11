/**
 * Assembles the clc-core resource clients over one configured transport.
 *
 * Each app creates exactly one instance and passes individual resource clients
 * where they are needed — `poolListQueryOptions(clcApi.pools, …)` rather than a
 * registry object threaded through everything. There is deliberately no
 * `createClcQueries(api)`: a single object spanning every resource is shallow
 * plumbing, and query options are plain functions that take the one client they
 * use.
 */

import { createAccountsClient } from "../features/accounts/client";
import { createAuthClient } from "../features/auth/client";
import { createMarketClient } from "../features/market/client";
import { createOfferingsClient } from "../features/offerings/client";
import { createPoolsClient } from "../features/pools/client";
import { createPoolDeployClient } from "../features/pools/deploy-client";
import { createReportsClient } from "../features/reports/client";
import { createVoucherDeployClient } from "../features/vouchers/deploy-client";
import { type CreateHttpClientOptions, createHttpClient } from "./http-client";

export type ClcApi = ReturnType<typeof createClcApi>;

export function createClcApi(options: CreateHttpClientOptions) {
  const http = createHttpClient(options);

  return {
    /** The shared transport, for resources not yet split into their own module. */
    http,
    accounts: createAccountsClient(http),
    auth: createAuthClient(http),
    market: createMarketClient(http),
    offerings: createOfferingsClient(http),
    pools: createPoolsClient(http),
    poolDeploy: createPoolDeployClient(http),
    reports: createReportsClient(http),
    voucherDeploy: createVoucherDeployClient(http),
  };
}
