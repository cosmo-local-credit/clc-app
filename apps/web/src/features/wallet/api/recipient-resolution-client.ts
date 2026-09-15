import { getAddress, isAddress } from "viem";

export type RecipientAddressResolution = {
  address: `0x${string}`;
};

export type RecipientNameResolution = {
  name: string;
};

/**
 * The Grassroots Economics v3 lookup stack, overridable per deployment.
 *
 * Hardcoded hosts meant the Gnosis build could only ever ask the Celo-era
 * resolver. Both move together: leaving one of the pair fixed makes this module
 * half-configurable, which is worse than either end of the choice.
 */
const PHONE_LOOKUP_BASE_URL =
  (import.meta.env.VITE_PHONE_LOOKUP_URL as string | undefined) ??
  "https://kvviseru.v3.grassecon.net/api/v1/lookup/address";
const ENS_RESOLVER_BASE_URL =
  (import.meta.env.VITE_ENS_RESOLVER_URL as string | undefined) ??
  "https://resolver.v3.grassecon.net/api/v1/resolve";

const LOOKUP_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export async function resolvePhoneRecipient(phone: string): Promise<RecipientAddressResolution> {
  const json = await getJson(`${PHONE_LOOKUP_BASE_URL}/${phone}`, "Phone lookup failed.");
  return { address: extractAddress(json, "Phone lookup response is missing an address.") };
}

export async function resolveEnsRecipient(ensName: string): Promise<RecipientAddressResolution> {
  const json = await getJson(
    `${ENS_RESOLVER_BASE_URL}/${encodeURIComponent(ensName)}`,
    "ENS lookup failed.",
  );
  return { address: extractAddress(json, "ENS lookup response is missing an address.") };
}

/**
 * The name registered for an address, or null when there is none.
 *
 * 400 counts as "no name" alongside 404. The gateway validates the parameter as
 * `eth_addr_checksum`, so an address that is not checksummed is rejected rather
 * than missed — and a lookup that is only ever decoration must not turn the send
 * screen into an error state. Callers checksum first; this is the backstop.
 */
export async function reverseResolveAddress(
  address: string,
): Promise<RecipientNameResolution | null> {
  const response = await fetch(
    `${ENS_RESOLVER_BASE_URL}/reverse/${encodeURIComponent(address)}`,
    LOOKUP_REQUEST,
  );
  if (response.status === 404 || response.status === 400) return null;
  const json = await readJson(response);
  if (!response.ok) throw new Error(extractDescription(json, "Reverse ENS lookup failed."));

  const name = extractName(json);
  return name ? { name } : null;
}

async function getJson(url: string, fallbackMessage: string): Promise<unknown> {
  const response = await fetch(url, LOOKUP_REQUEST);
  const json = await readJson(response);
  if (!response.ok) throw new Error(extractDescription(json, fallbackMessage));
  return json;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Checksums here, at the one place an address enters from the network, so no
 * caller has to remember to. The reverse-lookup gateway validates its parameter
 * as `eth_addr_checksum` and rejects anything else, so an address passed on
 * unchecksummed resolves to no name at all.
 */
function extractAddress(json: unknown, fallbackMessage: string): `0x${string}` {
  if (!isRecord(json)) throw new Error(fallbackMessage);
  const result = isRecord(json.result) ? json.result : json;
  if (typeof result.address !== "string" || !isAddress(result.address, { strict: false })) {
    throw new Error(extractDescription(json, fallbackMessage));
  }
  return getAddress(result.address);
}

function extractName(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const result = isRecord(json.result) ? json.result : json;
  return typeof result.name === "string" && result.name.trim() ? result.name : null;
}

function extractDescription(json: unknown, fallbackMessage: string): string {
  return isRecord(json) && typeof json.description === "string"
    ? json.description
    : fallbackMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
