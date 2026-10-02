import { z } from "zod";

const EMAIL_LOCAL_ATOM = /^[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~-]+$/u;
const EMAIL_DOMAIN_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{N}])?$/u;

/**
 * Validate the ordinary, unquoted address format supported by the product.
 * Splitting the local part and domain makes their dot and hyphen rules
 * explicit while retaining international letters and numbers.
 */
function isSupportedEmail(value: string): boolean {
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;

  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const localAtoms = local.split(".");
  const domainLabels = domain.split(".");

  if (!localAtoms.every((atom) => EMAIL_LOCAL_ATOM.test(atom))) return false;
  if (domainLabels.length < 2 || !domainLabels.every((label) => EMAIL_DOMAIN_LABEL.test(label))) {
    return false;
  }

  // A numeric final label is not a usable public email domain.
  return /\p{L}/u.test(domainLabels.at(-1) ?? "");
}

/**
 * Contact details are optional per field but validated identically everywhere
 * they are collected (signup profile, voucher issuer contact). An empty string
 * means "not provided"; callers decide whether that is acceptable.
 */
export const optionalEmailSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isSupportedEmail(value), {
    message: "Invalid email address",
  });

/** E.164: leading `+`, no zero-prefixed country code, 8–15 digits total. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Invalid phone number",
  });

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isOptionalHttpUrl(value: string): boolean {
  return value === "" || isHttpUrl(value);
}

export const optionalWebsiteSchema = z
  .string()
  .trim()
  .refine(isOptionalHttpUrl, "Enter a valid website URL including https://");

export const optionalTermsUrlSchema = z
  .string()
  .trim()
  .refine(isOptionalHttpUrl, "Enter a valid terms URL including https://");

export const TERMS_TEXT_MAX = 5000;

/** Terms written in the form itself, as Markdown, instead of linked to. */
export const optionalTermsTextSchema = z.string().trim().max(TERMS_TEXT_MAX, {
  message: "Terms must be 5000 characters or fewer",
});

/**
 * The stored `terms` column holds either a link or the terms themselves. A
 * reader tells them apart with `isHttpUrl`; a writer that has a mode switch
 * validates with the URL or text schema above instead of this one.
 */
export const optionalTermsSchema = z.string().trim().max(TERMS_TEXT_MAX, {
  message: "Terms must be 5000 characters or fewer",
});
