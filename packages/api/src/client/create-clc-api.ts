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
import { createCatalogsClient } from "../features/catalogs/client";
import { createAdminClient } from "../features/admin/client";
import { createAuthClient } from "../features/auth/client";
import { createDeploymentsClient } from "../features/deployments/client";
import { createMarketClient } from "../features/market/client";
import { createOfferingsClient } from "../features/offerings/client";
import { createPoolsClient } from "../features/pools/client";
import { createPretiumClient } from "../features/pretium/client";
import { createPoolDeployClient } from "../features/pools/deploy-client";
import { createRecipientsClient } from "../features/recipients/client";
import { createReportsClient } from "../features/reports/client";
import { createSafeClient } from "../features/safe/client";
import { createSymbolsClient } from "../features/symbols/client";
import { createVoucherDeployClient } from "../features/vouchers/deploy-client";
import { createVocabularyClient } from "../features/vocabulary/client";
import { createWantsClient } from "../features/wants/client";
import { type CreateHttpClientOptions, createHttpClient } from "./http-client";

export type CreateClcApiOptions = CreateHttpClientOptions & {
  /**
   * How the public catalog reads treat the browser's HTTP cache.
   *
   * Applies to every client whose endpoints are marked publicly cacheable — the
   * catalog reads and the public voucher-offerings read. An app that writes what
   * it reads passes `"no-store"`; see CreateMarketClientOptions for what happens
   * when it does not.
   */
  catalogCache?: RequestCache;
  /** Use the superadmin-only pool composition read, including retired vouchers. */
  adminPoolComposition?: boolean;
};

export function createClcApi({
  catalogCache,
  adminPoolComposition,
  ...options
}: CreateClcApiOptions) {
  const http = createHttpClient(options);

  // The package exports the transport factory so apps can preserve route-level
  // resource loading. This aggregate still returns resource clients only: a
  // caller needing a new request must add it to the appropriate module.
  return {
    accounts: createAccountsClient(http),
    catalogs: createCatalogsClient(http),
    admin: createAdminClient(http),
    auth: createAuthClient(http),
    deployments: createDeploymentsClient(http),
    market: createMarketClient(http, { cache: catalogCache }),
    offerings: createOfferingsClient(http, { cache: catalogCache }),
    pools: createPoolsClient(http, { adminComposition: adminPoolComposition }),
    poolDeploy: createPoolDeployClient(http),
    pretium: createPretiumClient(http),
    reports: createReportsClient(http),
    safe: createSafeClient(http),
    recipients: createRecipientsClient(http),
    symbols: createSymbolsClient(http),
    voucherDeploy: createVoucherDeployClient(http),
    vocabulary: createVocabularyClient(http),
    wants: createWantsClient(http),
  };
}
