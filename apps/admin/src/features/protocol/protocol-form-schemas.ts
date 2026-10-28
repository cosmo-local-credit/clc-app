import { POOL_FEE_PERCENT_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { isAddress, zeroAddress } from "viem";
import { z } from "zod";

export const protocolAddressSchema = z
  .string()
  .trim()
  .refine(
    (value) => isAddress(value) && value.toLowerCase() !== zeroAddress,
    "Enter a non-zero wallet address",
  );

export const protocolPercentSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      return BigInt(parseTokenAmount(value, POOL_FEE_PERCENT_DECIMALS)) <= 1_000_000n;
    } catch {
      return false;
    }
  }, "Enter a fee from 0 to 100");
