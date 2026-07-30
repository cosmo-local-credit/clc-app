import { describe, expect, it } from "vite-plus/test";

import { parseRecipientInput } from "./recipient-validation";

describe("parseRecipientInput", () => {
  it.each([
    ["254711", { kind: "phone", query: "+254711" }],
    ["255 711", { kind: "phone", query: "+255711" }],
    ["381 (64)", { kind: "phone", query: "+38164" }],
    ["00 49 151", { kind: "phone", query: "+49151" }],
    ["+49 (151)", { kind: "phone", query: "+49151" }],
    ["Alice@Example.COM", { kind: "email", query: "alice@example.com" }],
    ["Alice.Sarafu.ETH", { kind: "ens", query: "alice.sarafu.eth" }],
    ["ali", { kind: "ens", query: "ali" }],
  ])("classifies %s", (input, expected) => {
    expect(parseRecipientInput(input)).toEqual(expected);
  });

  it("treats a complete EVM address as a direct recipient", () => {
    expect(parseRecipientInput("0xa316408425cF17F1827483dee621c6C3A9B5fad4")).toEqual({
      kind: "address",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
    });
  });

  it.each(["0xa316", "ab", "a@", "+2", "07", "0711 777", "alice!"])(
    "does not issue a search for incomplete or unsupported input %s",
    (input) => {
      expect(parseRecipientInput(input)).toEqual({ kind: "unknown" });
    },
  );
});
