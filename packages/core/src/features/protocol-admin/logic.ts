import { encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";
import type { CaliburCall } from "../webauthn/index";

/**
 * Network-level owner calls: the protocol fee controller, an oracle relay, and
 * an ETH faucet. Pool- and voucher-scoped calls stay in their own modules.
 *
 * Pure: builds calldata and validates it, signs nothing.
 */

const PPM_MAX = 1_000_000;

export const protocolFeeControllerAbi = parseAbi([
  "function getProtocolFee() view returns (uint256)",
  "function getProtocolFeeRecipient() view returns (address)",
  "function isActive() view returns (bool)",
  "function setProtocolFee(uint256 newFee)",
  "function setProtocolFeeRecipient(address newRecipient)",
  "function setActive(bool active)",
  "function owner() view returns (address)",
]);

export const oracleRelayAbi = parseAbi([
  "function writer() view returns (address)",
  "function setWriter(address writer)",
  "function invalidate(address replacementWriter)",
  "function owner() view returns (address)",
]);

/** EthFaucet seal bits. Registry, period checker, then the drip amount. */
export const FAUCET_SEAL_REGISTRY = 1;
export const FAUCET_SEAL_PERIOD = 2;
export const FAUCET_SEAL_VALUE = 4;
export const FAUCET_SEAL_MAX = 7;

export const ethFaucetSealAbi = parseAbi([
  "function seal(uint8 state) returns (uint256)",
  "function sealState() view returns (uint8)",
  "function owner() view returns (address)",
]);

function assertContract(address: `0x${string}`, label: string): void {
  if (!isAddress(address) || address.toLowerCase() === zeroAddress) {
    throw new Error(`${label} must be a non-zero address.`);
  }
}

function parsePpm(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Protocol fee must be a non-negative integer string.");
  const fee = BigInt(value);
  if (fee > BigInt(PPM_MAX)) throw new Error("Protocol fee cannot exceed 100%.");
  return fee;
}

export function buildSetProtocolFeeCall(input: {
  controllerAddress: `0x${string}`;
  feePpm: string;
}): CaliburCall {
  assertContract(input.controllerAddress, "Protocol fee controller");
  return {
    to: input.controllerAddress,
    value: "0",
    data: encodeFunctionData({
      abi: protocolFeeControllerAbi,
      functionName: "setProtocolFee",
      args: [parsePpm(input.feePpm)],
    }),
  };
}

export function buildSetProtocolFeeRecipientCall(input: {
  controllerAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
}): CaliburCall {
  assertContract(input.controllerAddress, "Protocol fee controller");
  assertContract(input.recipientAddress, "Protocol fee recipient");
  return {
    to: input.controllerAddress,
    value: "0",
    data: encodeFunctionData({
      abi: protocolFeeControllerAbi,
      functionName: "setProtocolFeeRecipient",
      args: [input.recipientAddress],
    }),
  };
}

export function buildSetProtocolFeeActiveCall(input: {
  controllerAddress: `0x${string}`;
  active: boolean;
}): CaliburCall {
  assertContract(input.controllerAddress, "Protocol fee controller");
  return {
    to: input.controllerAddress,
    value: "0",
    data: encodeFunctionData({
      abi: protocolFeeControllerAbi,
      functionName: "setActive",
      args: [input.active],
    }),
  };
}

export function buildSetOracleRelayWriterCall(input: {
  relayAddress: `0x${string}`;
  writerAddress: `0x${string}`;
}): CaliburCall {
  assertContract(input.relayAddress, "Oracle relay");
  assertContract(input.writerAddress, "Oracle relay writer");
  return {
    to: input.relayAddress,
    value: "0",
    data: encodeFunctionData({
      abi: oracleRelayAbi,
      functionName: "setWriter",
      args: [input.writerAddress],
    }),
  };
}

export function buildInvalidateOracleRelayCall(input: {
  relayAddress: `0x${string}`;
  writerAddress: `0x${string}`;
}): CaliburCall {
  assertContract(input.relayAddress, "Oracle relay");
  assertContract(input.writerAddress, "Oracle relay writer");
  return {
    to: input.relayAddress,
    value: "0",
    data: encodeFunctionData({
      abi: oracleRelayAbi,
      functionName: "invalidate",
      args: [input.writerAddress],
    }),
  };
}

export function buildSealFaucetCall(input: {
  faucetAddress: `0x${string}`;
  state: number;
}): CaliburCall {
  assertContract(input.faucetAddress, "Faucet");
  if (!Number.isInteger(input.state) || input.state < 1 || input.state > FAUCET_SEAL_MAX) {
    throw new Error("Faucet seal state must be an integer from 1 to 7.");
  }
  return {
    to: input.faucetAddress,
    value: "0",
    data: encodeFunctionData({
      abi: ethFaucetSealAbi,
      functionName: "seal",
      args: [input.state],
    }),
  };
}
