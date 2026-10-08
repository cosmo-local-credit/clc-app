import { describe, expect, it } from "vite-plus/test";
import { formatCsv, PAPER_WALLET_CSV_TEMPLATE, parseCsv, parsePaperWalletCsv } from "./logic";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"one\ntwo",x\n')).toEqual([["one\ntwo", "x"]]);
  });
});

describe("parsePaperWalletCsv", () => {
  it("accepts the template", () => {
    const result = parsePaperWalletCsv(PAPER_WALLET_CSV_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(result.rows[1]?.recipient).toEqual({
      name: "John Doe",
      email: "",
      phone: "+254722000111",
      country: "KE",
      currency: "",
    });
  });

  it("matches loose headers, normalises case and ignores unknown columns", () => {
    const result = parsePaperWalletCsv(
      "Full Name,Phone Number,Notes,Country Code\nA,+254700000001,x,ke\n",
    );
    expect(result.ok && result.rows[0]?.recipient).toMatchObject({
      name: "A",
      phone: "+254700000001",
      country: "KE",
    });
  });

  it.each([
    ["254712345678", "+254712345678"],
    ["447911123456", "+447911123456"],
    ["12125551234", "+12125551234"],
    ["12345678", "+12345678"],
    ["123456789012345", "+123456789012345"],
    [" 254712345678 ", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["  +254712345678  ", "+254712345678"],
    ["", ""],
  ])("normalises CSV phone %s to %s without errors", (phone, expected) => {
    const result = parsePaperWalletCsv(`name,phone\nA,${phone}\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.recipient.phone).toBe(expected);
    expect(result.rows[0]?.errors).toEqual([]);
  });

  it.each([
    "0712345678",
    "254",
    "1234567890123456",
    "25471234567a",
    "254 712345678",
    "2.54712345678E+11",
    "++254712345678",
  ])("keeps invalid CSV phone %s flagged", (phone) => {
    const result = parsePaperWalletCsv(`name,phone\nA,${phone}\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.recipient.phone).toBe(phone);
    expect(result.rows[0]?.errors).toEqual([
      "Invalid phone number (use international format, e.g. +254712345678)",
    ]);
  });

  it.each([
    ["+254712345678", "254712345678"],
    ["254712345678", "+254712345678"],
  ])("detects duplicate phones after normalising %s and %s", (first, second) => {
    const result = parsePaperWalletCsv(`name,phone\nA,${first}\nB,${second}\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.errors).toEqual([]);
    expect(result.rows[1]).toMatchObject({
      line: 3,
      recipient: { phone: "+254712345678" },
      errors: ["Same phone as line 2"],
    });
  });

  it("flags invalid fields and in-file duplicates by line", () => {
    const result = parsePaperWalletCsv(
      "name,email,phone,country,currency\nA,bad,0712,Kenya,XXX\nB,b@x.io,,,\n\nC,B@X.io,,,\n",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.errors).toHaveLength(4);
    expect(result.rows[1]?.errors).toEqual([]);
    expect(result.rows[2]).toMatchObject({ line: 5, errors: ["Same email as line 3"] });
  });

  it("reads a per-row password and keeps it off the recipient", () => {
    const result = parsePaperWalletCsv("name,passphrase\nA, sunflower \nB,\nC,short\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.password)).toEqual(["sunflower", "", "short"]);
    expect(result.rows[0]?.recipient).not.toHaveProperty("password");
    expect(result.rows[1]?.errors).toEqual([]);
    expect(result.rows[2]?.errors).toEqual(["Password must be at least 6 characters"]);
  });

  it("rejects files without recognised columns or rows", () => {
    expect(parsePaperWalletCsv("")).toMatchObject({ ok: false });
    expect(parsePaperWalletCsv("foo,bar\n1,2\n")).toMatchObject({ ok: false });
    expect(parsePaperWalletCsv("name\n")).toMatchObject({ ok: false });
  });
});

describe("formatCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [
      ["address", "note"],
      ["0x1", 'said "hi", then left'],
    ];
    expect(parseCsv(formatCsv(rows))).toEqual(rows);
  });
});
