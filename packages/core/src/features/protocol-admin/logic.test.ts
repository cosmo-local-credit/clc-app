import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vite-plus/test";

import {
  buildInvalidateOracleRelayCall,
  buildSealFaucetCall,
  buildSetOracleRelayWriterCall,
  buildSetProtocolFeeActiveCall,
  buildSetProtocolFeeCall,
  buildSetProtocolFeeRecipientCall,
  ethFaucetSealAbi,
  oracleRelayAbi,
  protocolFeeControllerAbi,
} from "./logic";

const CONTROLLER = "0x8e0a000000000000000000000000000000000b41" as const;
const RELAY = "0xb91c000000000000000000000000000000007d20" as const;
const FAUCET = "0x4d90000000000000000000000000000000000a1c" as const;
const RECIPIENT = "0x9911000000000000000000000000000000002244" as const;

describe("protocol fee controller", () => {
  it("sets the fee in PPM, including zero", () => {
    const call = buildSetProtocolFeeCall({ controllerAddress: CONTROLLER, feePpm: "0" });
    expect(decodeFunctionData({ abi: protocolFeeControllerAbi, data: call.data })).toEqual({
      functionName: "setProtocolFee",
      args: [0n],
    });
    expect(call.to).toBe(CONTROLLER);
  });

  it("refuses a fee above 100%", () => {
    expect(() =>
      buildSetProtocolFeeCall({ controllerAddress: CONTROLLER, feePpm: "1000001" }),
    ).toThrow(/cannot exceed 100%/);
  });

  it("sets the recipient and the active flag", () => {
    const recipient = buildSetProtocolFeeRecipientCall({
      controllerAddress: CONTROLLER,
      recipientAddress: RECIPIENT,
    });
    expect(
      decodeFunctionData({ abi: protocolFeeControllerAbi, data: recipient.data }).args,
    ).toEqual([RECIPIENT]);
    const active = buildSetProtocolFeeActiveCall({ controllerAddress: CONTROLLER, active: false });
    expect(decodeFunctionData({ abi: protocolFeeControllerAbi, data: active.data })).toEqual({
      functionName: "setActive",
      args: [false],
    });
  });

  it("refuses the zero address", () => {
    expect(() =>
      buildSetProtocolFeeRecipientCall({
        controllerAddress: CONTROLLER,
        recipientAddress: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow(/non-zero address/);
  });
});

describe("oracle relay", () => {
  it("sets the writer and invalidates the round with a replacement writer", () => {
    const writer = buildSetOracleRelayWriterCall({
      relayAddress: RELAY,
      writerAddress: RECIPIENT,
    });
    expect(decodeFunctionData({ abi: oracleRelayAbi, data: writer.data })).toEqual({
      functionName: "setWriter",
      args: [RECIPIENT],
    });
    const invalidated = buildInvalidateOracleRelayCall({
      relayAddress: RELAY,
      writerAddress: RECIPIENT,
    });
    expect(decodeFunctionData({ abi: oracleRelayAbi, data: invalidated.data }).functionName).toBe(
      "invalidate",
    );
  });
});

describe("faucet seal", () => {
  it("seals the bits it is given", () => {
    const call = buildSealFaucetCall({ faucetAddress: FAUCET, state: 7 });
    expect(decodeFunctionData({ abi: ethFaucetSealAbi, data: call.data })).toEqual({
      functionName: "seal",
      args: [7],
    });
  });

  it("refuses a state outside 1 to 7", () => {
    expect(() => buildSealFaucetCall({ faucetAddress: FAUCET, state: 0 })).toThrow(/1 to 7/);
    expect(() => buildSealFaucetCall({ faucetAddress: FAUCET, state: 8 })).toThrow(/1 to 7/);
  });
});
