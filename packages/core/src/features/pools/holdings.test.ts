import { describe, expect, it } from "vite-plus/test";
import { buildPoolHoldings } from "./holdings";

const voucher = {
  tokenAddress: "0xabc",
  name: "Voucher",
  symbol: "V",
  decimals: 6,
  iconUrl: null,
  tokenLimit: "100000000",
};
const treasury = new Map([
  [
    voucher.tokenAddress,
    {
      balanceRaw: "50000000",
      feesRaw: "10000000",
      withdrawableRaw: "40000000",
      limitRaw: "100000000",
    },
  ],
]);

describe("shared pool holdings", () => {
  it("uses gross balances for credit and fee-adjusted liquidity for value", () => {
    const [holding] = buildPoolHoldings({
      pool: { limiterAddress: "0xlimiter" },
      vouchers: [voucher],
      treasury,
      rates: new Map([[voucher.tokenAddress, 2000000n]]),
      requireRates: true,
    });
    expect(holding).toMatchObject({
      headroomRaw: "50000000",
      liquidityRaw: "40000000",
      unitValueRaw: "80000000",
      headroomUnitValueRaw: "100000000",
    });
  });

  it("keeps unread relative rates unknown instead of valuing them at parity", () => {
    const [holding] = buildPoolHoldings({
      pool: { limiterAddress: "0xlimiter" },
      vouchers: [voucher],
      treasury,
      requireRates: true,
    });
    expect(holding).toMatchObject({
      unitValueRaw: null,
      headroomUnitValueRaw: null,
      headroomRaw: "50000000",
    });
  });

  it("keeps holdings and credit available without a readable quoter", () => {
    const [holding] = buildPoolHoldings({
      pool: { limiterAddress: "0xlimiter" },
      vouchers: [voucher],
      treasury,
      priced: false,
    });
    expect(holding).toMatchObject({
      balanceRaw: "50000000",
      liquidityRaw: "40000000",
      headroomRaw: "50000000",
      unitValueRaw: null,
    });
  });
});
