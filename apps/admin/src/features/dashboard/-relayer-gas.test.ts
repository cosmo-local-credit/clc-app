import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchRelayerGas,
  formatRelayerGas,
  RELAYER_GAS_FLOOR_WEI,
  relayerGasTone,
} from "./relayer-gas";

describe("relayerGasTone", () => {
  it("is danger below 10 CELO and success at or above it", () => {
    expect(relayerGasTone(RELAYER_GAS_FLOOR_WEI - 1n)).toBe("danger");
    expect(relayerGasTone(RELAYER_GAS_FLOOR_WEI)).toBe("success");
    expect(relayerGasTone(RELAYER_GAS_FLOOR_WEI + 1n)).toBe("success");
  });
});

describe("formatRelayerGas", () => {
  it("renders CELO with the shared token formatter", () => {
    expect(formatRelayerGas((12n * 10n ** 18n + 5n * 10n ** 16n).toString())).toBe("12.05 CELO");
    expect(formatRelayerGas((8n * 10n ** 18n).toString())).toBe("8 CELO");
  });
});

describe("fetchRelayerGas", () => {
  const address = "0x2Dd3bB110D5609723b761416d2EA914F20E1FfD4";

  it("reads gasBalance from the keystore account status endpoint", async () => {
    const getHealth = vi.fn().mockResolvedValue({
      result: { relayerAddress: address, chainId: 42220 },
    });
    const getAccountStatus = vi.fn().mockResolvedValue({
      gasBalance: "3202847782677689810",
      networkNonce: 4,
      internalNonce: 5,
      active: true,
    });

    const gas = await fetchRelayerGas({ getHealth } as never, { getAccountStatus });

    expect(getHealth).toHaveBeenCalledOnce();
    expect(getAccountStatus).toHaveBeenCalledWith(address, undefined);
    expect(gas).toEqual({ address, wei: "3202847782677689810" });
  });

  it("fails when health omits the signer rather than inventing a zero balance", async () => {
    await expect(
      fetchRelayerGas(
        { getHealth: vi.fn().mockResolvedValue({ result: { chainId: 42220 } }) } as never,
        { getAccountStatus: vi.fn() },
      ),
    ).rejects.toThrow("Relayer health did not include a signer address.");
  });
});
