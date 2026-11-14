import {
  bytesToHex,
  encodeFunctionData,
  getAddress,
  maxUint256,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { describe, expect, it } from "vite-plus/test";

import {
  erc20ApproveAbi,
  swapPoolWithdrawBoundedAbi,
  swapPoolWithdrawToSenderAbi,
} from "../pool-swaps/logic";
import { buildCaliburNonce, type CaliburCall, computeEIP712Digest } from "../webauthn/logic";
import {
  type CreditQuoteCheck,
  type CreditQuoteForVerification,
  type CreditQuoteMode,
  type CreditQuoteRequestSent,
  type CreditReviewTerms,
  creditRouteProblem,
  formatCreditRate,
  formatFeePpm,
  ROOT_KEY_HASH,
  verifyCreditQuote,
} from "./logic";

type Address = `0x${string}`;

const address = (seed: string) => getAddress(`0x${seed.repeat(40).slice(0, 40)}`);
const WALLET = address("a1");
const ATTACKER = address("e7");
const RELAYER = address("5e");
const CALIBUR = getAddress("0x000000009b1d0af20d8c6d0a44e162d11f9b8f00");
const POOL_1 = address("b1");
const POOL_2 = address("b2");
const POOL_3 = address("b3");
const VOUCHER_A = address("c1");
const VOUCHER_B = address("c2");
const VOUCHER_C = address("c3");
const VOUCHER_X = address("c9");
const CHAIN_ID = 100n;
const NOW = 1_794_567_590;
const DEADLINE = BigInt(NOW + 300);
const PASSKEY_KEY_HASH = `0x${"7f".repeat(32)}` as const;

type HopSpec = {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOut: bigint;
  recipient: Address;
};

type Build = {
  mode: CreditQuoteMode;
  hops: HopSpec[];
  /** Shown per hop; defaults to what the calldata spends. */
  shownHops?: { pool: Address; tokenIn: Address; tokenOut: Address; amountIn: string }[];
  deadline?: bigint;
  withdrawDeadlines?: bigint[];
  executor?: Address;
  keyHash?: `0x${string}`;
  nonce?: bigint;
  revertOnFailure?: boolean;
  approveAmounts?: bigint[];
  resetAmounts?: bigint[];
  approveSpenders?: Address[];
  mapCalls?: (calls: CaliburCall[]) => CaliburCall[];
  domain?: { chainId: bigint; wallet: Address; calibur: Address };
};

function approveCall(token: Address, spender: Address, amount: bigint): CaliburCall {
  return {
    to: token,
    value: "0",
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}

function withdrawCall(hop: HopSpec, deadline: bigint): CaliburCall {
  return {
    to: hop.pool,
    value: "0",
    data: encodeFunctionData({
      abi: swapPoolWithdrawBoundedAbi,
      functionName: "withdraw",
      args: [hop.tokenOut, hop.tokenIn, hop.amountIn, hop.recipient, hop.minOut, deadline],
    }),
  };
}

/**
 * A self-consistent quote, as a dishonest server would send one: every field
 * agrees with the calldata and the digest is computed over the batch it sends.
 */
function buildQuote(build: Build): CreditQuoteForVerification {
  const deadline = build.deadline ?? DEADLINE;
  const keyHash = build.keyHash ?? ROOT_KEY_HASH;
  let calls = build.hops.flatMap((hop, index) => [
    approveCall(
      hop.tokenIn,
      build.approveSpenders?.[index] ?? hop.pool,
      build.resetAmounts?.[index] ?? 0n,
    ),
    approveCall(
      hop.tokenIn,
      build.approveSpenders?.[index] ?? hop.pool,
      build.approveAmounts?.[index] ?? hop.amountIn,
    ),
    withdrawCall(hop, build.withdrawDeadlines?.[index] ?? deadline),
  ]);
  if (build.mapCalls) calls = build.mapCalls(calls);
  const batch = {
    batchedCall: { calls, revertOnFailure: build.revertOnFailure ?? true },
    nonce: (build.nonce ?? buildCaliburNonce(keyHash, 7n)).toString(),
    keyHash,
    executor: build.executor ?? RELAYER,
    deadline: deadline.toString(),
  };
  const domain = build.domain ?? { chainId: CHAIN_ID, wallet: WALLET, calibur: CALIBUR };
  const digest = bytesToHex(
    computeEIP712Digest(batch, domain.wallet, domain.calibur, domain.chainId),
  );
  return {
    quoteId: digest,
    mode: build.mode,
    hops:
      build.shownHops ??
      build.hops.map((hop) => ({
        pool: hop.pool,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        amountIn: hop.amountIn.toString(),
      })),
    batch: { ...batch, digest },
  };
}

const ROUTE_2 = [
  { pool: POOL_1, tokenIn: VOUCHER_A, tokenOut: VOUCHER_B },
  { pool: POOL_2, tokenIn: VOUCHER_B, tokenOut: VOUCHER_C },
];

/** Exact output: obtain 5 C through B, spending the 5.002 A shown on review. */
const EXACT_OUTPUT = {
  request: {
    route: ROUTE_2,
    mode: "exactOutput",
    amount: "5000000",
    recipient: null,
    keyHash: ROOT_KEY_HASH,
  } satisfies CreditQuoteRequestSent,
  reviewed: { amountIn: "5002000", minAmountOut: "5000000" } satisfies CreditReviewTerms,
  hops: [
    { ...ROUTE_2[0]!, amountIn: 5_002_000n, minOut: 5_001_000n, recipient: WALLET },
    { ...ROUTE_2[1]!, amountIn: 5_001_000n, minOut: 5_000_000n, recipient: WALLET },
  ] satisfies HopSpec[],
};

/** Exact input: spend 1 A for at least the 0.9998 C shown on review. */
const EXACT_INPUT = {
  request: {
    route: ROUTE_2,
    mode: "exactInput",
    amount: "1000000",
    recipient: null,
    keyHash: ROOT_KEY_HASH,
  } satisfies CreditQuoteRequestSent,
  reviewed: { amountIn: "1000000", minAmountOut: "999600" } satisfies CreditReviewTerms,
  hops: [
    { ...ROUTE_2[0]!, amountIn: 1_000_000n, minOut: 999_800n, recipient: WALLET },
    { ...ROUTE_2[1]!, amountIn: 999_800n, minOut: 999_600n, recipient: WALLET },
  ] satisfies HopSpec[],
};

type Fixture = {
  request: CreditQuoteRequestSent;
  reviewed: CreditReviewTerms;
};

function verify(
  fixture: Fixture,
  quote: CreditQuoteForVerification,
  overrides: Partial<Parameters<typeof verifyCreditQuote>[0]> = {},
) {
  return verifyCreditQuote({
    request: fixture.request,
    reviewed: fixture.reviewed,
    quote,
    wallet: WALLET,
    chainId: CHAIN_ID,
    caliburAddress: CALIBUR,
    relayerAddress: RELAYER,
    nowSeconds: NOW,
    ...overrides,
  });
}

function expectRefused(
  result: ReturnType<typeof verifyCreditQuote>,
  check: CreditQuoteCheck,
  hop?: number | null,
) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.check).toBe(check);
  if (hop !== undefined) expect(result.hop).toBe(hop);
}

function withHop(hops: HopSpec[], index: number, patch: Partial<HopSpec>): HopSpec[] {
  return hops.map((hop, i) => (i === index ? { ...hop, ...patch } : hop));
}

describe("verifyCreditQuote — the honest response", () => {
  it("accepts an exact-output two-hop batch and signs the app's own digest", () => {
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops });
    const result = verify(EXACT_OUTPUT, quote);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const own = bytesToHex(computeEIP712Digest(result.signedBatch, WALLET, CALIBUR, CHAIN_ID));
    expect(result.digest).toBe(own);
    expect(result.signedBatch.batchedCall.calls).toHaveLength(6);
    expect(result.signedBatch.executor).toBe(RELAYER);
    expect(result.signedBatch.deadline).toBe(DEADLINE.toString());
  });

  it("accepts an exact-input two-hop batch", () => {
    expect(verify(EXACT_INPUT, buildQuote({ mode: "exactInput", hops: EXACT_INPUT.hops })).ok).toBe(
      true,
    );
  });

  it("accepts a one-hop batch paid to a requested recipient, signed by a passkey", () => {
    const recipient = address("d4");
    const fixture = {
      request: {
        route: [ROUTE_2[0]!],
        mode: "exactInput" as const,
        amount: "1000000",
        recipient,
        keyHash: PASSKEY_KEY_HASH,
      },
      reviewed: { amountIn: "1000000", minAmountOut: "999800" },
    };
    const quote = buildQuote({
      mode: "exactInput",
      keyHash: PASSKEY_KEY_HASH,
      hops: [{ ...ROUTE_2[0]!, amountIn: 1_000_000n, minOut: 999_800n, recipient }],
    });
    expect(verify(fixture, quote).ok).toBe(true);
  });

  it("uses the bounded withdraw selector the router builds", () => {
    expect(toFunctionSelector(swapPoolWithdrawBoundedAbi[0])).toBe("0x909a6e32");
  });
});

describe("verifyCreditQuote — row 1: chain id, wallet as verifying contract, Calibur salt", () => {
  const honest = { chainId: CHAIN_ID, wallet: WALLET, calibur: CALIBUR };
  it.each([
    ["another chain", { ...honest, chainId: 1n }],
    ["another verifying contract", { ...honest, wallet: ATTACKER }],
    ["another Calibur salt", { ...honest, calibur: address("0c") }],
  ])("refuses a digest bound to %s", (_, domain) => {
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops, domain });
    expectRefused(verify(EXACT_OUTPUT, quote), "domain");
  });
});

describe("verifyCreditQuote — row 2: ordered pools and vouchers of every hop", () => {
  it("refuses a different pool on hop two", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 1, { pool: POOL_3 });
    expectRefused(verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })), "route", 1);
  });

  it("refuses a different bridge voucher", () => {
    const hops = withHop(withHop(EXACT_OUTPUT.hops, 0, { tokenOut: VOUCHER_X }), 1, {
      tokenIn: VOUCHER_X,
    });
    const quote = buildQuote({
      mode: "exactOutput",
      hops,
      shownHops: ROUTE_2.map((hop, index) => ({
        ...hop,
        amountIn: EXACT_OUTPUT.hops[index]!.amountIn.toString(),
      })),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "route", 0);
  });

  it("refuses a different final voucher", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 1, { tokenOut: VOUCHER_X });
    expectRefused(verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })), "route", 1);
  });

  it("refuses the hops in another order", () => {
    const hops = [EXACT_OUTPUT.hops[1]!, EXACT_OUTPUT.hops[0]!];
    expectRefused(verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })), "route");
  });

  it("refuses a review that shows other pools than the batch uses", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      shownHops: [
        { ...ROUTE_2[0]!, amountIn: "5002000" },
        { ...ROUTE_2[1]!, pool: POOL_3, amountIn: "5001000" },
      ],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "route", 1);
  });
});

describe("verifyCreditQuote — row 3: first-hop input", () => {
  it("exact input: refuses spending more than the requested amount", () => {
    const hops = withHop(EXACT_INPUT.hops, 0, { amountIn: 2_000_000n });
    expectRefused(verify(EXACT_INPUT, buildQuote({ mode: "exactInput", hops })), "first_input", 0);
  });

  it("exact output: refuses spending more than the input shown on review", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 0, { amountIn: 9_000_000n });
    expectRefused(
      verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })),
      "first_input",
      0,
    );
  });
});

describe("verifyCreditQuote — row 4: final minAmountOut", () => {
  it("exact input: refuses a minimum below the one shown on review", () => {
    const hops = withHop(EXACT_INPUT.hops, 1, { minOut: 1n });
    expectRefused(
      verify(EXACT_INPUT, buildQuote({ mode: "exactInput", hops })),
      "final_minimum",
      1,
    );
  });

  it("exact output: refuses a minimum below the requested quantity", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 1, { minOut: 4_000_000n });
    expectRefused(
      verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })),
      "final_minimum",
      1,
    );
  });
});

describe("verifyCreditQuote — row 5: final recipient", () => {
  it("refuses an output paid to someone else", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 1, { recipient: ATTACKER });
    expectRefused(
      verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })),
      "final_recipient",
      1,
    );
  });

  it("refuses the wallet when the app asked for another recipient", () => {
    const fixture = {
      ...EXACT_OUTPUT,
      request: { ...EXACT_OUTPUT.request, recipient: address("d4") },
    };
    expectRefused(
      verify(fixture, buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops })),
      "final_recipient",
    );
  });
});

describe("verifyCreditQuote — row 6: intermediate recipients", () => {
  it("refuses a bridge voucher paid to someone else", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 0, { recipient: ATTACKER });
    expectRefused(
      verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })),
      "intermediate_recipient",
      0,
    );
  });
});

describe("verifyCreditQuote — row 7: each approval", () => {
  it("refuses an approval to another spender", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      approveSpenders: [ATTACKER, POOL_2],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "approval", 0);
  });

  it("refuses an approval above the hop's input", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      approveAmounts: [5_002_000n, maxUint256],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "approval", 1);
  });

  it("refuses a hop without the zero reset", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      resetAmounts: [5_002_000n, 0n],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "approval", 0);
  });
});

describe("verifyCreditQuote — row 8: batch shape", () => {
  it("refuses an extra call", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      mapCalls: (calls) => [...calls, approveCall(VOUCHER_A, ATTACKER, maxUint256)],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape");
  });

  it("refuses a call that sends value", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      mapCalls: (calls) =>
        calls.map((call, index) => (index === 2 ? { ...call, value: "1" } : call)),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape");
  });

  it("refuses a batch that does not revert on failure", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      revertOnFailure: false,
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape");
  });

  it("refuses the unbounded withdraw overload", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      mapCalls: (calls) =>
        calls.map((call, index) =>
          index === 5
            ? {
                ...call,
                data: encodeFunctionData({
                  abi: swapPoolWithdrawToSenderAbi,
                  functionName: "withdraw",
                  args: [VOUCHER_C, VOUCHER_B, 5_001_000n],
                }),
              }
            : call,
        ),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape", 1);
  });

  it("refuses calldata with trailing bytes", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      mapCalls: (calls) =>
        calls.map((call, index) =>
          index === 2 ? { ...call, data: `${call.data}${"00".repeat(32)}` as `0x${string}` } : call,
        ),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape", 0);
  });

  it("refuses a hop missing its reset call", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      mapCalls: (calls) => calls.filter((_, index) => index !== 0),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "batch_shape");
  });
});

describe("verifyCreditQuote — row 9: deadline and executor", () => {
  it("refuses a deadline beyond the horizon", () => {
    const deadline = BigInt(NOW + 86_400);
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops, deadline });
    expectRefused(verify(EXACT_OUTPUT, quote), "deadline");
  });

  it("refuses an expired deadline", () => {
    const deadline = BigInt(NOW - 1);
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops, deadline });
    expectRefused(verify(EXACT_OUTPUT, quote), "deadline");
  });

  it("refuses no deadline at all", () => {
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops, deadline: 0n });
    expectRefused(verify(EXACT_OUTPUT, quote), "deadline");
  });

  it("refuses a withdrawal with a later deadline than the signed batch", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      withdrawDeadlines: [DEADLINE, DEADLINE + 3_000n],
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "deadline", 1);
  });

  it.each([
    ["another executor", ATTACKER],
    ["the zero executor anyone may relay with", zeroAddress],
  ])("refuses %s", (_, executor) => {
    const quote = buildQuote({ mode: "exactOutput", hops: EXACT_OUTPUT.hops, executor });
    expectRefused(verify(EXACT_OUTPUT, quote), "executor");
  });
});

describe("verifyCreditQuote — what the table implies", () => {
  it("refuses a hop one that does not guarantee what hop two spends", () => {
    const hops = withHop(EXACT_OUTPUT.hops, 0, { minOut: 1n });
    expectRefused(
      verify(EXACT_OUTPUT, buildQuote({ mode: "exactOutput", hops })),
      "intermediate_minimum",
      0,
    );
  });

  it("refuses a batch for another signing key", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      keyHash: PASSKEY_KEY_HASH,
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "signer");
  });

  it("refuses a nonce drawn from another key's sequence", () => {
    const quote = buildQuote({
      mode: "exactOutput",
      hops: EXACT_OUTPUT.hops,
      nonce: buildCaliburNonce(PASSKEY_KEY_HASH, 3n),
    });
    expectRefused(verify(EXACT_OUTPUT, quote), "signer");
  });

  it("refuses a quote for the other mode", () => {
    const quote = buildQuote({ mode: "exactInput", hops: EXACT_OUTPUT.hops });
    expectRefused(verify(EXACT_OUTPUT, quote), "route");
  });
});

describe("creditRouteProblem", () => {
  it("accepts a contiguous two-hop route", () => {
    expect(creditRouteProblem(ROUTE_2)).toBeNull();
  });

  it.each([
    ["empty", []],
    ["too_long", [...ROUTE_2, { pool: POOL_3, tokenIn: VOUCHER_C, tokenOut: VOUCHER_X }]],
    ["not_contiguous", [ROUTE_2[0]!, { ...ROUTE_2[1]!, tokenIn: VOUCHER_X }]],
    ["repeats", [ROUTE_2[0]!, { ...ROUTE_2[1]!, pool: POOL_1 }]],
    ["repeats", [ROUTE_2[0]!, { ...ROUTE_2[1]!, tokenOut: VOUCHER_A }]],
  ] as const)("reports %s", (problem, route) => {
    expect(creditRouteProblem(route)).toBe(problem);
  });
});

describe("display helpers", () => {
  it("formats an effective fee in ppm", () => {
    expect(formatFeePpm("200")).toBe("0.02%");
    expect(formatFeePpm("0")).toBe("0.00%");
    expect(formatFeePpm("50")).toBe("<0.01%");
    expect(formatFeePpm("12500")).toBe("1.25%");
    expect(formatFeePpm("x")).toBeNull();
  });

  it("formats a rate across decimals", () => {
    expect(
      formatCreditRate({ amountIn: "1000000", amountOut: "999800", decimalsIn: 6, decimalsOut: 6 }),
    ).toBe("0.99");
    expect(
      formatCreditRate({
        amountIn: "1000000",
        amountOut: "10000000000000000000",
        decimalsIn: 6,
        decimalsOut: 18,
      }),
    ).toBe("10.00");
    expect(
      formatCreditRate({ amountIn: "0", amountOut: "1", decimalsIn: 6, decimalsOut: 6 }),
    ).toBeNull();
  });
});
