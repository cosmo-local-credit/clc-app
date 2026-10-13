import { describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createRecipientsClient } from "./client";

const address = "0x1111111111111111111111111111111111111111";
const pool = { kind: "pool", name: "Sohail Pool", alias: "Sohail Pool", address, chainId: 100 };
function setup(result: unknown) {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, result }), { status: 200 })),
    );
  return {
    fetcher,
    client: createRecipientsClient(
      createHttpClient({ baseUrl: "https://core.test", fetch: fetcher }),
    ),
  };
}
describe("internal recipients", () => {
  it("searches the Core database without name suffixes and validates recipients", async () => {
    const { client, fetcher } = setup({ recipients: [pool, { ...pool, address: "0x123" }] });
    await expect(client.search("wllr")).resolves.toEqual([pool]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://core.test/api/v2/recipients?q=wllr",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });
  it("encodes current names and reverse resolves concrete addresses", async () => {
    const { client, fetcher } = setup({ recipient: pool });
    await expect(client.resolve("Sohail Pool")).resolves.toEqual(pool);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://core.test/api/v2/recipients/resolve?name=Sohail+Pool",
    );
    await expect(client.reverse(address)).resolves.toEqual(pool);
    expect(fetcher.mock.calls[1][0]).toBe(`https://core.test/api/v2/recipients/reverse/${address}`);
  });
  it("rejects malformed exact results instead of returning a transfer destination", async () => {
    const { client } = setup({ recipient: { ...pool, chainId: -1 } });
    await expect(client.resolve("Sohail Pool")).rejects.toThrow("Invalid recipient response");
  });

  it("rejects malformed search envelopes and filters malformed search rows", async () => {
    const malformed = setup({ recipients: "not-an-array" });
    await expect(malformed.client.search("alice")).rejects.toThrow(
      "Invalid recipient search response",
    );

    const mixed = setup({
      recipients: [pool, null, { ...pool, name: "" }, { ...pool, address: "0x123" }],
    });
    await expect(mixed.client.search("alice")).resolves.toEqual([pool]);
  });

  it("validates reverse lookups and username suggestions", async () => {
    const malformedReverse = setup({ recipient: { ...pool, alias: "" } });
    await expect(malformedReverse.client.reverse(address)).rejects.toThrow(
      "Invalid recipient response",
    );

    const malformedSuggestion = setup({ username: " " });
    await expect(malformedSuggestion.client.suggest("Alice")).rejects.toThrow(
      "Invalid username suggestion response",
    );

    const suggestion = setup({ username: "Željko Petrović" });
    await expect(suggestion.client.suggest("Alice Smith")).resolves.toBe("Željko Petrović");
    expect(suggestion.fetcher.mock.calls[0][0]).toBe(
      "https://core.test/api/v2/recipients/suggest?hint=Alice+Smith",
    );
  });
});

it("keeps username punctuation inside a query parameter", async () => {
  const { client, fetcher } = setup({ recipient: pool });
  await client.resolve("Ž / #?&");
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe("/api/v2/recipients/resolve");
  expect(url.searchParams.get("name")).toBe("Ž / #?&");
});
