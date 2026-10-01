export type RecipientAddressResolution = {
  address: `0x${string}`;
};

const PHONE_LOOKUP_BASE_URL = "https://kvviseru.v3.grassecon.net/api/v1/lookup/address";

const LOOKUP_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export async function resolvePhoneRecipient(phone: string): Promise<RecipientAddressResolution> {
  const json = await getJson(`${PHONE_LOOKUP_BASE_URL}/${phone}`, "Phone lookup failed.");
  return { address: extractAddress(json, "Phone lookup response is missing an address.") };
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
  if (typeof result.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(result.address)) {
    throw new Error(extractDescription(json, fallbackMessage));
  }
  return result.address as `0x${string}`;
}

function extractDescription(json: unknown, fallbackMessage: string): string {
  return isRecord(json) && typeof json.description === "string"
    ? json.description
    : fallbackMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
