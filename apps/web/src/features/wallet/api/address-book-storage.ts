import type { Recipient, RecipientSource } from "#/components/wallet/wallet-data";
import {
  readOwnerScoped,
  removeOwnerScoped,
  writeOwnerScoped,
} from "#/lib/storage/owner-scoped-storage";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * The saved recipients one account can send to.
 *
 * Scoped to an owner, and this is the store that most needed it. It was a single
 * global list, so on a shared phone the next person to sign in opened the send
 * flow and saw the previous person's contacts — their labels and their wallet
 * addresses — and could send to them. Names plus a payment graph, which is the
 * most sensitive thing in client storage after the key itself.
 *
 * The owner is part of the key rather than a field in the list, because a list
 * merges: with one slot, two people's contacts would have to either overwrite
 * each other or live in the same array, and neither is what anyone wants.
 */

export type AddressBookRecipientSource = RecipientSource;

export type AddressBookRecipient = Recipient & {
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

export type UpsertAddressBookRecipientInput = {
  label: string;
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

const ADDRESS_BOOK_STORAGE_NAME = "address-book.v1";

export function readAddressBookRecipients(owner: StorageOwner): AddressBookRecipient[] {
  const raw = readOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const recipient = parseAddressBookRecipient(value);
      return recipient ? [recipient] : [];
    });
  } catch {
    return [];
  }
}

export function upsertAddressBookRecipient(
  owner: StorageOwner,
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
    ...readAddressBookRecipients(owner).filter((item) => item.id !== normalizedAddress),
  ];
  writeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME, JSON.stringify(next));
  return recipient;
}

export function clearAddressBookRecipients(owner: StorageOwner): void {
  removeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME);
}

function parseAddressBookRecipient(value: unknown): AddressBookRecipient | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.seed === "string" &&
    typeof value.address === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(value.address)
  ) {
    const source = normalizeAddressBookRecipientSource(value.source);
    if (!source) return null;
    return {
      id: value.address.toLowerCase(),
      label: value.label,
      seed: value.seed,
      address: value.address as `0x${string}`,
      source,
    };
  }
  return null;
}

function normalizeAddressBookRecipientSource(value: unknown): AddressBookRecipientSource | null {
  if (value === "ens") return "alias";
  if (value === "reverse-ens") return "reverse-name";
  if (
    value === "manual" ||
    value === "phone" ||
    value === "alias" ||
    value === "reverse-name" ||
    value === "qr"
  ) {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
