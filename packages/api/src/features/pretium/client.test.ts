import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createPretiumClient } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createPretiumClient(createHttpClient({ baseUrl: "https://api.test" }));

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pretium-client", () => {
  it("triggers a Pretium onramp through the backend proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            ok: true,
            result: { transactionCode: "PTM-1", status: "PENDING", message: "STK sent" },
          }),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.triggerPretiumOnramp({
      address: ADDRESS,
      phoneNumber: "+254712345678",
      asset: "cUSD",
      amount: 20,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v2/pretium/trigger-onramp");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      address: ADDRESS,
      phoneNumber: "+254712345678",
      asset: "cUSD",
      amount: 20,
    });
    expect(result).toEqual({ transactionCode: "PTM-1", status: "PENDING", message: "STK sent" });
  });

  it("reads Pretium rates from the backend proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(JSON.stringify({ ok: true, result: { buy: 128.5, sell: "127.75" } })),
      }),
    );

    await expect(api.getPretiumRates()).resolves.toEqual({ buy: "128.5", sell: "127.75" });
  });

  it("normalizes address transaction responses from Pretium", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              result: {
                address: ADDRESS,
                onramps: [
                  {
                    ID: 1,
                    PretiumID: "ON-1",
                    PretiumStatus: "PENDING",
                    AmountKES: "20.00",
                    AmountUSD: "0.15",
                    CreatedAt: "2026-07-06T09:00:00Z",
                  },
                ],
                offramps: [
                  {
                    id: 2,
                    pretium_id: "OFF-1",
                    pretium_status: "SUCCESS",
                    amount_kes: "50.00",
                    amount_usd: "0.39",
                    created_at: "2026-07-06T10:00:00Z",
                  },
                ],
                totalCount: 2,
              },
            }),
          ),
      }),
    );

    const result = await api.getPretiumTransactionsByAddress(ADDRESS);

    expect(result.totalCount).toBe(2);
    expect(result.onramps[0]?.reference).toBe("ON-1");
    expect(result.offramps[0]?.reference).toBe("OFF-1");
    expect(result.offramps[0]?.status).toBe("SUCCESS");
  });
});
