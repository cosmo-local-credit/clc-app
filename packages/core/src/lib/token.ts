import { z } from "zod";

export const tokenDecimalsSchema = z
  .string()
  .trim()
  .refine((value) => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 18, {
    message: "Decimals must be a whole number from 0 to 18",
  });
