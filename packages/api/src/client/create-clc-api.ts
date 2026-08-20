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
import { createAdminClient } from "../features/admin/client";
import { createAuthClient } from "../features/auth/client";
import { createDeploymentsClient } from "../features/deployments/client";
import { createMarketClient } from "../features/market/client";
import { createOfferingsClient } from "../features/offerings/client";
import { createPoolsClient } from "../features/pools/client";
import { createPretiumClient } from "../features/pretium/client";
import { createPoolDeployClient } from "../features/pools/deploy-client";
import { createReportsClient } from "../features/reports/client";
import { createVoucherDeployClient } from "../features/vouchers/deploy-client";
import { type CreateHttpClientOptions, createHttpClient } from "./http-client";

export function createClcApi(options: CreateHttpClientOptions) {
  const http = createHttpClient(options);

  // The package exports the transport factory so apps can preserve route-level
  // resource loading. This aggregate still returns resource clients only: a
  // caller needing a new request must add it to the appropriate module.
  return {
    accounts: createAccountsClient(http),
    admin: createAdminClient(http),
    auth: createAuthClient(http),
    deployments: createDeploymentsClient(http),
    market: createMarketClient(http),
    offerings: createOfferingsClient(http),
    pools: createPoolsClient(http),
    poolDeploy: createPoolDeployClient(http),
    pretium: createPretiumClient(http),
    reports: createReportsClient(http),
    voucherDeploy: createVoucherDeployClient(http),
  };
}
