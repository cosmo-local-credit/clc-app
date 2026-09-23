import { optionalEmailSchema, optionalPhoneSchema } from "../../lib/contact";
import { isIsoCurrency } from "../../lib/currencies";

/**
 * Bulk paper wallet issuance: an operator either asks for N blank wallets or
 * uploads a CSV with the little they know about each recipient. Everything is
 * optional per row; the holder completes the rest of their profile after they
 * first sign in.
 */

export const MAX_PAPER_WALLET_BATCH = 500;

export type PaperWalletRecipient = {
  name: string;
  email: string;
  phone: string;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  /** ISO 4217, upper case. */
  currency: string;
};

export const EMPTY_PAPER_WALLET_RECIPIENT: PaperWalletRecipient = {
  name: "",
  email: "",
  phone: "",
  country: "",
  currency: "",
};

export type PaperWalletCsvRow = {
  /** 1-based line in the file, for pointing an operator at the bad row. */
  line: number;
  recipient: PaperWalletRecipient;
  errors: string[];
};

export type PaperWalletCsvResult =
  | { ok: true; rows: PaperWalletCsvRow[] }
  | { ok: false; error: string };

export const PAPER_WALLET_CSV_TEMPLATE =
  "name,email,phone,country,currency\n" +
  "Jane Doe,jane.doe@example.com,+254712345678,KE,KES\n" +
  "John Doe,,+254722000111,KE,\n";

const HEADER_ALIASES: Record<string, keyof PaperWalletRecipient> = {
  name: "name",
  full_name: "name",
  email: "email",
  email_address: "email",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  country: "country",
  country_code: "country",
  currency: "currency",
  currency_code: "currency",
  preferred_currency: "currency",
};

/**
 * RFC 4180 CSV: comma separated, fields optionally double-quoted, a doubled
 * quote inside a quoted field is a literal quote, and CRLF or LF ends a record.
 * A leading byte-order mark (what spreadsheet exports prepend) is dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function validateRecipient(recipient: PaperWalletRecipient): string[] {
  const errors: string[] = [];
  if (recipient.name.length > 80) errors.push("Name must be 80 characters or fewer");
  if (!optionalEmailSchema.safeParse(recipient.email).success) errors.push("Invalid email address");
  if (!optionalPhoneSchema.safeParse(recipient.phone).success) {
    errors.push("Invalid phone number (use international format, e.g. +254712345678)");
  }
  if (recipient.country && !/^[A-Z]{2}$/.test(recipient.country)) {
    errors.push("Country must be a two-letter code, e.g. KE");
  }
  if (recipient.currency && !isIsoCurrency(recipient.currency)) {
    errors.push("Currency must be a supported ISO code, e.g. KES");
  }
  return errors;
}

/**
 * Parses and validates an operator's CSV. Header names are matched loosely
 * ("Phone Number", "phone_number" and "mobile" all map to phone) and unknown
 * columns are ignored. Blank lines are skipped. Emails and phones must be
 * unique within the file, because the backend rejects a second account
 * claiming either.
 */
export function parsePaperWalletCsv(text: string): PaperWalletCsvResult {
  const records = parseCsv(text);
  const header = records[0];
  if (!header) return { ok: false, error: "The file is empty." };

  const columns = header.map((cell) => HEADER_ALIASES[normalizeHeader(cell)]);
  if (!columns.some(Boolean)) {
    return {
      ok: false,
      error: "No recognised columns. Use the template: name, email, phone, country, currency.",
    };
  }

  const rows: PaperWalletCsvRow[] = [];
  records.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) return;
    const recipient: PaperWalletRecipient = { ...EMPTY_PAPER_WALLET_RECIPIENT };
    columns.forEach((key, column) => {
      if (!key) return;
      const value = (cells[column] ?? "").trim();
      recipient[key] =
        key === "country" || key === "currency"
          ? value.toUpperCase()
          : key === "email"
            ? value.toLowerCase()
            : value;
    });
    rows.push({ line: index + 2, recipient, errors: validateRecipient(recipient) });
  });

  if (rows.length === 0) return { ok: false, error: "The file has a header but no rows." };
  if (rows.length > MAX_PAPER_WALLET_BATCH) {
    return {
      ok: false,
      error: `A batch is limited to ${MAX_PAPER_WALLET_BATCH} wallets; this file has ${rows.length}.`,
    };
  }

  for (const key of ["email", "phone"] as const) {
    const firstLine = new Map<string, number>();
    for (const row of rows) {
      const value = row.recipient[key];
      if (!value) continue;
      const seen = firstLine.get(value);
      if (seen === undefined) firstLine.set(value, row.line);
      else row.errors.push(`Same ${key} as line ${seen}`);
    }
  }

  return { ok: true, rows };
}

/** RFC 4180 output, quoting only the fields that need it. */
export function formatCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((field) => (/[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
        .join(","),
    )
    .join("\r\n")
    .concat("\r\n");
}
