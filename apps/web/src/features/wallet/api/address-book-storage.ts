import type { Recipient } from "#/components/wallet/wallet-data";

export type AddressBookRecipientSource = "manual" | "phone" | "ens" | "reverse-ens" | "qr";

export type AddressBookRecipient = Recipient & {
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

export type UpsertAddressBookRecipientInput = {
  label: string;
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

const STORAGE_KEY = "clc_address_book_v1";

export function readAddressBookRecipients(): AddressBookRecipient[] {
  const raw = getStorage()?.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAddressBookRecipient);
  } catch {
    return [];
  }
}

export function upsertAddressBookRecipient(
  input: UpsertAddressBookRecipientInput,
): AddressBookRecipient {
  const normalizedAddress = input.address.toLowerCase();
  const recipient: AddressBookRecipient = {
    id: normalizedAddress,
    label: input.label,
    address: input.address,
    seed: input.label,
    source: input.source,
  };
  const next = [
    recipient,
    ...readAddressBookRecipients().filter((item) => item.id !== normalizedAddress),
  ];
  writeAddressBookRecipients(next);
  return recipient;
}

export function clearAddressBookRecipients(): void {
  getStorage()?.removeItem(STORAGE_KEY);
}

function writeAddressBookRecipients(recipients: AddressBookRecipient[]): void {
  getStorage()?.setItem(STORAGE_KEY, JSON.stringify(recipients));
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isAddressBookRecipient(value: unknown): value is AddressBookRecipient {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.seed === "string" &&
    typeof value.address === "string" &&
    value.address.startsWith("0x") &&
    isAddressBookRecipientSource(value.source)
  );
}

function isAddressBookRecipientSource(value: unknown): value is AddressBookRecipientSource {
  return (
    value === "manual" ||
    value === "phone" ||
    value === "ens" ||
    value === "reverse-ens" ||
    value === "qr"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
