export type RecipientAddressResolution = {
  address: `0x${string}`;
};

export type RecipientNameResolution = {
  name: string;
};

const PHONE_LOOKUP_BASE_URL = "https://kvviseru.v3.grassecon.net/api/v1/lookup/address";
const ENS_RESOLVER_BASE_URL = "https://resolver.v3.grassecon.net/api/v1/resolve";

const LOOKUP_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export async function resolvePhoneRecipient(phone: string): Promise<RecipientAddressResolution> {
  const json = await getJson(
    `${PHONE_LOOKUP_BASE_URL}/${encodeURIComponent(phone)}`,
    "Phone lookup failed.",
  );
  return { address: extractAddress(json, "Phone lookup response is missing an address.") };
}

export async function resolveEnsRecipient(ensName: string): Promise<RecipientAddressResolution> {
  const json = await getJson(
    `${ENS_RESOLVER_BASE_URL}/${encodeURIComponent(ensName)}`,
    "ENS lookup failed.",
  );
  return { address: extractAddress(json, "ENS lookup response is missing an address.") };
}

export async function reverseResolveAddress(
  address: string,
): Promise<RecipientNameResolution | null> {
  const response = await fetch(
    `${ENS_RESOLVER_BASE_URL}/reverse/${encodeURIComponent(address)}`,
    LOOKUP_REQUEST,
  );
  if (response.status === 404) return null;
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

function extractAddress(json: unknown, fallbackMessage: string): `0x${string}` {
  if (!isRecord(json)) throw new Error(fallbackMessage);
  const result = isRecord(json.result) ? json.result : json;
  if (typeof result.address !== "string" || !result.address.startsWith("0x")) {
    throw new Error(extractDescription(json, fallbackMessage));
  }
  return result.address as `0x${string}`;
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
