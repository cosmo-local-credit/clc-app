/**
 * The credit router (clc-core API.md §14.13–§14.17): what the session wallet
 * can reach with the vouchers it holds, the routes to one voucher, an
 * authoritative quote with the batch to sign, and grouped receipts.
 *
 * Discovery answers are estimates as of a block; only a quote is authoritative.
 * Every response is private to the wallet, so every read is `no-store` and the
 * query keys carry the wallet.
 */

import type { CreditQuoteMode, CreditRouteHopRef } from "@clc/core/features/credit-router/logic";
import { getAddress } from "viem";
import { z } from "zod";

import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";

export type CreditDepth = 1 | 2;

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => getAddress(value));
const hexSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/)
  .transform((value) => value as `0x${string}`);
const hash32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value as `0x${string}`);
const rawSchema = z.string().regex(/^\d+$/);
const blockSchema = z.number().int().nonnegative();

const freshnessShape = {
  asOfBlock: blockSchema,
  graphVersion: z.number().int().nonnegative(),
  /** Served from a graph older than the router's threshold, or a reconciliation is failing. */
  stale: z.boolean(),
};

const reachSchema = z.object({
  ...freshnessShape,
  depth: z.union([z.literal(1), z.literal(2)]),
  digest: hash32Schema,
  inputs: z.array(z.object({ voucher: addressSchema, balance: rawSchema })),
  vouchers: z.array(z.object({ address: addressSchema, minHops: z.number().int().min(1) })),
  pools: z.array(z.object({ address: addressSchema, minHops: z.number().int().min(1) })),
});
export type CreditReach = z.infer<typeof reachSchema>;

const routeHopSchema = z.object({
  pool: z.object({ address: addressSchema, name: z.string() }),
  tokenIn: addressSchema,
  tokenOut: addressSchema,
  feePpm: rawSchema,
  /** `pair` once the exact pair fee has been read; `default` estimates with the pool's default fee. */
  feeSource: z.enum(["pair", "default"]).catch("default"),
  protocolFeePpm: rawSchema,
});

const refusalSchema = z.object({ reason: z.string(), hop: z.number().int() });

const routeSchema = z.object({
  id: z.string(),
  hops: z.array(routeHopSchema).min(1),
  rate: z.object({ amountIn: rawSchema, amountOut: rawSchema }).nullable(),
  /** Null when the maximum could not be established; the route can still be quoted. */
  maxAmountIn: rawSchema.nullable(),
  maxAmountOut: rawSchema.nullable(),
  maxIsExact: z.boolean(),
  limitedBy: z.enum(["wallet", "deposit_cap", "liquidity"]).nullable().catch(null),
  limitedByHop: z.number().int().optional(),
  carriesAmount: z.boolean().optional(),
  amountIn: rawSchema.optional(),
  amountOut: rawSchema.optional(),
  refusal: refusalSchema.optional(),
  effectiveFeePpm: rawSchema,
});
export type CreditRoute = z.infer<typeof routeSchema>;

const routesPageSchema = z.object({
  ...freshnessShape,
  target: z.object({
    address: addressSchema,
    symbol: z.string(),
    decimals: z.number().int().min(0).max(255),
  }),
  complete: z.boolean(),
  inputs: z.array(
    z.object({
      voucher: addressSchema,
      walletBalance: rawSchema,
      routes: z.array(routeSchema),
    }),
  ),
  fallbackPools: z.array(
    z.object({
      address: addressSchema,
      name: z.string(),
      liquidity: rawSchema,
      accepts: z.array(addressSchema),
    }),
  ),
  cursor: z.string().min(1).nullable(),
});
export type CreditRoutesPage = z.infer<typeof routesPageSchema>;
export type CreditRouteInput = CreditRoutesPage["inputs"][number];
export type CreditFallbackPool = CreditRoutesPage["fallbackPools"][number];

const callSchema = z.object({ to: addressSchema, value: rawSchema, data: hexSchema });

const quoteSchema = z.object({
  quoteId: hash32Schema,
  block: z.object({ number: blockSchema, hash: hash32Schema }),
  expiresAt: z.number().int().positive(),
  mode: z.enum(["exactInput", "exactOutput"]),
  amountIn: rawSchema,
  amountOut: rawSchema,
  minAmountOut: rawSchema,
  recipient: addressSchema,
  hops: z
    .array(
      z.object({
        pool: addressSchema,
        tokenIn: addressSchema,
        tokenOut: addressSchema,
        amountIn: rawSchema,
        grossOut: rawSchema,
        poolFee: rawSchema,
        protocolFee: rawSchema,
        netOut: rawSchema,
        minAmountOut: rawSchema,
        feePpm: rawSchema,
        protocolFeePpm: rawSchema,
      }),
    )
    .min(1),
  fees: z.object({ feeFreeAmountOut: rawSchema, effectiveFeePpm: rawSchema }),
  surplus: z.object({
    output: rawSchema,
    bridge: z.array(z.object({ voucher: addressSchema, amount: rawSchema })),
  }),
  batch: z.object({
    batchedCall: z.object({ calls: z.array(callSchema), revertOnFailure: z.boolean() }),
    nonce: rawSchema,
    keyHash: hash32Schema,
    executor: addressSchema,
    deadline: rawSchema,
    digest: hash32Schema,
  }),
  simulation: z.object({ ok: z.boolean(), gasEstimate: rawSchema.nullable() }),
  /** False means the first relay must carry an EIP-7702 authorization. */
  delegated: z.boolean(),
  eoaNonce: rawSchema,
});
export type CreditQuote = z.infer<typeof quoteSchema>;

const nullableRaw = rawSchema.nullable();
const receiptHopSchema = z.object({
  index: z.number().int().nonnegative(),
  pool: addressSchema,
  tokenIn: addressSchema,
  tokenOut: addressSchema,
  amountIn: rawSchema,
  minAmountOut: rawSchema,
  recipient: addressSchema,
  txHash: hash32Schema.nullable(),
  block: z.number().int().nullable(),
  logIndex: z.number().int().nullable(),
  settledAmountIn: nullableRaw,
  quotedAmountOut: nullableRaw,
  nominalAmountOut: nullableRaw,
  amountOut: nullableRaw,
  poolFee: nullableRaw,
  protocolFee: nullableRaw,
  settledAt: z.string().nullable(),
});
export type RoutedSwapHop = z.infer<typeof receiptHopSchema>;

const receiptSchema = z.object({
  swap: z.object({
    trackingId: z.string().min(1),
    chainId: z.number().int(),
    wallet: addressSchema,
    recipient: addressSchema,
    tokenIn: addressSchema,
    tokenOut: addressSchema,
    amountIn: rawSchema,
    minAmountOut: rawSchema,
    hopCount: z.number().int().min(1),
    bounded: z.boolean(),
    deadline: z.number().int().nullable(),
    createdAt: z.string(),
    txHash: hash32Schema.nullable(),
    /** The relayed transaction's dispatch status; null until the relayer has sent it. */
    status: z.string().nullable(),
    hops: z
      .array(receiptHopSchema)
      .nullable()
      .transform((hops) => [...(hops ?? [])].sort((left, right) => left.index - right.index)),
  }),
  /** True once every hop has its settlement event. */
  settled: z.boolean(),
  bridgeRemainder: z.array(z.object({ voucher: addressSchema, amount: rawSchema })),
});
export type RoutedSwapReceipt = z.infer<typeof receiptSchema>;

const receiptPageSchema = z.object({
  items: z.array(receiptSchema),
  cursor: z.string().min(1).nullable(),
});
export type RoutedSwapPage = z.infer<typeof receiptPageSchema>;

export type CreditRoutesParams = {
  to: string;
  depth: CreditDepth;
  from?: string;
  amount?: string;
  mode?: CreditQuoteMode;
  cursor?: string;
};

export type CreditQuoteRequest = {
  route: readonly CreditRouteHopRef[];
  mode: CreditQuoteMode;
  amount: string;
  recipient: `0x${string}` | null;
  /** All zeros or empty for the Sign-in Card's root key; a passkey sends its key hash. */
  keyHash: `0x${string}`;
};

/** A refused route's constraint, from API.md §14.13. Unknown values pass through. */
export type CreditRouteRefusal =
  | "not_allowed_in"
  | "not_allowed_out"
  | "deposit_cap"
  | "liquidity"
  | "fee_domain"
  | "zero_input"
  | "zero_output"
  | "overflow"
  | "unsupported_quoter"
  | "unsupported_token"
  | "wallet_balance"
  | "retired"
  | "search_budget"
  | "unsupported_wallet"
  | "gas"
  | (string & {});

/**
 * The router's failure states a caller must tell apart. A `router_unavailable`
 * answer is retryable and is never an empty result.
 */
export type CreditRouterFailure =
  | { state: "route_unavailable"; reason: CreditRouteRefusal; hop: number }
  | { state: "quote_mismatch"; hop: number | null }
  | {
      state: "simulation_failed";
      revert: { reason: string; message: string; data: string } | null;
    }
  | { state: "router_unavailable" }
  /** The route listing changed between pages: restart from the first page. */
  | { state: "cursor_stale" };

const failureResultSchema = z
  .object({
    reason: z.string().optional().catch(undefined),
    hop: z.number().int().optional().catch(undefined),
    revert: z
      .object({
        reason: z.string().catch(""),
        message: z.string().catch(""),
        data: z.string().catch(""),
      })
      .nullish()
      .catch(null),
  })
  .catch({});

/**
 * Reads a router failure out of a backend error, by its `E24`–`E28` code. Null
 * for every other error (validation, session, rate limit, network), which the
 * caller handles as it handles any request.
 */
export function creditRouterFailure(error: unknown): CreditRouterFailure | null {
  if (!(error instanceof BackendApiError)) return null;
  const result = failureResultSchema.parse(error.result ?? {});
  switch (error.code) {
    case "E24":
      return {
        state: "route_unavailable",
        reason: result.reason ?? "unknown",
        hop: result.hop ?? -1,
      };
    case "E25":
      return { state: "quote_mismatch", hop: result.hop ?? null };
    case "E26":
      return { state: "simulation_failed", revert: result.revert ?? null };
    case "E27":
      return { state: "router_unavailable" };
    case "E28":
      return { state: "cursor_stale" };
    default:
      return null;
  }
}

export function createCreditRouterClient(http: HttpClient) {
  async function read<S extends z.ZodType>(schema: S, path: string, init: RequestInit) {
    const parsed = schema.safeParse(
      await http.request<unknown>(path, { cache: "no-store", ...init }),
    );
    if (!parsed.success) {
      throw new BackendApiError(NO_HTTP_STATUS, "Invalid credit router response", undefined, {
        kind: "protocol",
        cause: parsed.error,
      });
    }
    return parsed.data as z.output<S>;
  }

  return {
    /** `GET /users/me/credit`: the vouchers and pools the wallet can probably reach. */
    reach(depth: CreditDepth, signal?: AbortSignal): Promise<CreditReach> {
      return read(reachSchema, `/api/v2/users/me/credit?depth=${depth}`, {
        method: "GET",
        signal,
      });
    },

    /** `GET /users/me/credit/routes`: routes to one voucher, grouped by input voucher. */
    routes(params: CreditRoutesParams, signal?: AbortSignal): Promise<CreditRoutesPage> {
      const query = new URLSearchParams({ to: params.to, depth: String(params.depth) });
      if (params.from) query.set("from", params.from);
      if (params.amount) {
        query.set("amount", params.amount);
        query.set("mode", params.mode ?? "exactInput");
      }
      if (params.cursor) query.set("cursor", params.cursor);
      return read(routesPageSchema, `/api/v2/users/me/credit/routes?${query}`, {
        method: "GET",
        signal,
      });
    },

    /** `POST /users/me/credit/quote`: the authoritative quote and the batch to sign. */
    quote(request: CreditQuoteRequest, signal?: AbortSignal): Promise<CreditQuote> {
      return read(quoteSchema, "/api/v2/users/me/credit/quote", {
        method: "POST",
        body: JSON.stringify({
          route: request.route.map((hop) => ({
            pool: getAddress(hop.pool),
            tokenIn: getAddress(hop.tokenIn),
            tokenOut: getAddress(hop.tokenOut),
          })),
          mode: request.mode,
          amount: request.amount,
          recipient: request.recipient ? getAddress(request.recipient) : null,
          keyHash: request.keyHash,
        }),
        signal,
      });
    },

    /** `GET /users/me/routed-swaps`: grouped receipts, newest first. */
    routedSwaps(cursor: string | undefined, signal?: AbortSignal): Promise<RoutedSwapPage> {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return read(receiptPageSchema, `/api/v2/users/me/routed-swaps${suffix}`, {
        method: "GET",
        signal,
      });
    },

    /** `GET /users/me/routed-swaps/:trackingId`: one grouped receipt. */
    routedSwap(trackingId: string, signal?: AbortSignal): Promise<RoutedSwapReceipt> {
      return read(
        receiptSchema,
        `/api/v2/users/me/routed-swaps/${encodeURIComponent(trackingId)}`,
        { method: "GET", signal },
      );
    },
  };
}

export type CreditRouterClient = ReturnType<typeof createCreditRouterClient>;
