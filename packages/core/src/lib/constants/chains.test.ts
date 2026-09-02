import { describe, expect, it } from "vite-plus/test";
import { CELO_MAINNET_CHAIN_ID } from "./celo";
import { chainMetadata, explorerAddressUrl, explorerTxUrl } from "./chains";
import { GNOSIS_MAINNET_CHAIN_ID } from "./gnosis";

describe("chainMetadata", () => {
  it("describes every chain the product deploys against", () => {
    expect(chainMetadata(CELO_MAINNET_CHAIN_ID)?.name).toBe("Celo");
    expect(chainMetadata(GNOSIS_MAINNET_CHAIN_ID)?.name).toBe("Gnosis");
    expect(chainMetadata(GNOSIS_MAINNET_CHAIN_ID)?.nativeSymbol).toBe("xDAI");
    expect(chainMetadata(GNOSIS_MAINNET_CHAIN_ID)?.explorerName).toBe("Gnosisscan");
  });

  it("returns undefined rather than defaulting an unknown chain to mainnet", () => {
    expect(chainMetadata(1)).toBeUndefined();
    expect(explorerTxUrl(1, "0xabc")).toBeUndefined();
    expect(explorerAddressUrl(1, "0xabc")).toBeUndefined();
  });
});

describe("explorer urls", () => {
  it("links a hash to the explorer of the chain it settled on", () => {
    expect(explorerTxUrl(CELO_MAINNET_CHAIN_ID, "0xabc")).toBe("https://celoscan.io/tx/0xabc");
    expect(explorerTxUrl(GNOSIS_MAINNET_CHAIN_ID, "0xabc")).toBe("https://gnosisscan.io/tx/0xabc");
  });

  it("links an address to the explorer of the chain it lives on", () => {
    expect(explorerAddressUrl(GNOSIS_MAINNET_CHAIN_ID, "0xdef")).toBe(
      "https://gnosisscan.io/address/0xdef",
    );
  });
});
