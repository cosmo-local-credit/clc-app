import { describe, expect, it } from "vite-plus/test";

import {
  CELO_ALFAJORES_CHAIN_ID,
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CUSD_ADDRESS,
} from "../../lib/constants/celo";
import { GNOSIS_MAINNET_CHAIN_ID } from "../../lib/constants/gnosis";
import { chainHasPretiumRamp, offrampTokenSymbol, pretiumOfframpRecipient } from "./pretium";

/**
 * Which chains carry a ramp is asserted here rather than left to whichever
 * chain a build happens to point at. Nothing pinned it before, so the answer
 * changed under the wallet's own tests when a build moved to Gnosis: four of
 * them exercised MPESA copy that `chainHasPretiumRamp` had already hidden.
 */
describe("chainHasPretiumRamp", () => {
  it("is wired on Celo mainnet and nowhere else", () => {
    expect(chainHasPretiumRamp(CELO_MAINNET_CHAIN_ID)).toBe(true);
    expect(chainHasPretiumRamp(GNOSIS_MAINNET_CHAIN_ID)).toBe(false);
    expect(chainHasPretiumRamp(CELO_ALFAJORES_CHAIN_ID)).toBe(false);
  });
});

describe("pretiumOfframpRecipient", () => {
  // Undefined rather than a fallback: another chain's recipient is an address
  // no offramp worker watches, so a transfer there is simply lost.
  it("has no recipient for a chain without a ramp", () => {
    expect(pretiumOfframpRecipient(CELO_MAINNET_CHAIN_ID)).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(pretiumOfframpRecipient(GNOSIS_MAINNET_CHAIN_ID)).toBeUndefined();
  });
});

describe("offrampTokenSymbol", () => {
  it("matches a supported stable by address, whatever its case", () => {
    expect(offrampTokenSymbol(CELO_MAINNET_CHAIN_ID, CELO_MAINNET_CUSD_ADDRESS)).toBe("USDm");
    expect(offrampTokenSymbol(CELO_MAINNET_CHAIN_ID, CELO_MAINNET_CUSD_ADDRESS.toUpperCase())).toBe(
      "USDm",
    );
  });

  it("is null for an unsupported token and for a chain without a ramp", () => {
    expect(
      offrampTokenSymbol(CELO_MAINNET_CHAIN_ID, "0x0000000000000000000000000000000000000001"),
    ).toBeNull();
    expect(offrampTokenSymbol(GNOSIS_MAINNET_CHAIN_ID, CELO_MAINNET_CUSD_ADDRESS)).toBeNull();
  });
});
