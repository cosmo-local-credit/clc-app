import { describe, expect, it } from "vite-plus/test";
import { voucherSymbolSchema } from "../features/vouchers/logic";
import {
  candidatesFromName,
  normalizeSymbolPrefix,
  pickAvailableSymbol,
  symbolStemFromName,
} from "./symbol";

describe("symbolStemFromName", () => {
  it.each([
    ["Kivukoni School Voucher", "KVKS"],
    ["Kisimama Shop Voucher", "KSMS"],
    ["Kilifi Harvest", "KLFH"],
    ["Kivukoni", "KVKN"],
    ["Kawangware Community Pool", "KWNG"],
    ["Ward 3 Voucher", "WRD3"],
    ["Ko Voucher", "KO"],
    ["kilifi harvest", "KLFH"],
    ["Café Pool", "CFAE"],
    ["St. Mary's Shop Voucher", "STMS"],
    ["The Voucher", "THEV"],
    ["Voucher", "VCHR"],
    ["", ""],
    ["!!! ---", ""],
  ])("%s → %s", (name, stem) => {
    expect(symbolStemFromName(name)).toBe(stem);
  });
});

describe("candidatesFromName", () => {
  it("treats the bare stem as issuance one and numbers the next one two", () => {
    const candidates = candidatesFromName("Kivukoni School Voucher");
    expect(candidates.slice(0, 3)).toEqual(["KVKS", "KVKS2", "KVKS3"]);
    expect(candidates.at(-1)).toBe("KVKS99");
    expect(candidates).toHaveLength(99);
  });

  it("skips a bare stem too short for the schema", () => {
    expect(candidatesFromName("Ko Voucher").slice(0, 2)).toEqual(["KO1", "KO2"]);
  });

  it("is empty when the name has no usable characters", () => {
    expect(candidatesFromName("   ")).toEqual([]);
  });

  it.each(["Kivukoni School Voucher", "Ko Voucher", "Ward 3 Voucher", "Café Pool"])(
    "every candidate for %s passes the symbol schema",
    (name) => {
      for (const candidate of candidatesFromName(name)) {
        expect(voucherSymbolSchema.safeParse(candidate).success).toBe(true);
      }
    },
  );
});

describe("pickAvailableSymbol", () => {
  const candidates = candidatesFromName("Kivukoni School Voucher");

  it.each([
    [[], "KVKS"],
    [["KVKS"], "KVKS2"],
    [["KVKS", "KVKS2", "KVKS3", "KVKS4"], "KVKS5"],
  ])("with %j taken picks %s", (taken, expected) => {
    expect(pickAvailableSymbol(candidates, new Set(taken))).toBe(expected);
  });

  it("is undefined once every candidate is taken", () => {
    expect(pickAvailableSymbol(candidates, new Set(candidates))).toBeUndefined();
  });
});

describe("normalizeSymbolPrefix", () => {
  it.each([
    [" kvks ", "KVKS"],
    ["KVKS1", "KVKS1"],
    ["", null],
    ["KVKS-1", null],
    ["ABCDEFG", null],
  ])("%j → %j", (value, expected) => {
    expect(normalizeSymbolPrefix(value)).toBe(expected);
  });
});
