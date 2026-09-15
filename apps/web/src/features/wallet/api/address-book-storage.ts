import { isEns, isPhone } from "#/features/wallet/logic/recipient-validation";
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
 *
 * **What the network says and what the user says are separate fields.** `v1`
 * held one `label`, which was an ENS name, or a phone number, or the address
 * repeated — so there was nowhere to put "Mom". Saving a nickname would have
 * overwritten the resolved name and the next send would have overwritten the
 * nickname straight back. Hence the split, and the rule that follows from it:
 * {@link saveAddressBookEntry} refreshes what the resolver answered and never
 * touches `nickname`; {@link renameAddressBookEntry} writes `nickname` and
 * never touches the rest.
 */

export type AddressBookEntrySource = "manual" | "phone" | "ens" | "reverse-ens" | "qr";

export type AddressBookEntry = {
  /** Lowercased address — the identity of the entry. */
  id: string;
  /** Checksummed address, as sent. */
  address: `0x${string}`;
  /** Reverse-resolved name. Refreshed on every save; null when none resolves. */
  ensName: string | null;
  /** Set when the address was reached through a phone lookup. */
  phone: string | null;
  /** User-set. Never written by a save — only by a rename. */
  nickname: string | null;
  source: AddressBookEntrySource;
};

export type SaveAddressBookEntryInput = {
  address: `0x${string}`;
  ensName: string | null;
  phone: string | null;
  source: AddressBookEntrySource;
};

const ADDRESS_BOOK_STORAGE_NAME = "address-book.v2";
const LEGACY_ADDRESS_BOOK_STORAGE_NAME = "address-book.v1";

/**
 * What to call this entry, or null when nothing but the address is known.
 *
 * Null rather than a placeholder word: every caller renders the ellipsized
 * address in that case, which is true, where "Address" or "Unknown" reads like
 * a name the contact actually chose.
 */
export function addressBookEntryName(entry: AddressBookEntry): string | null {
  return entry.nickname ?? entry.ensName ?? entry.phone ?? null;
}

export function readAddressBookEntries(owner: StorageOwner): AddressBookEntry[] {
  const stored = parseEntries(readOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME));
  if (stored.length > 0) return stored;

  const migrated = migrateLegacyEntries(readOwnerScoped(owner, LEGACY_ADDRESS_BOOK_STORAGE_NAME));
  removeOwnerScoped(owner, LEGACY_ADDRESS_BOOK_STORAGE_NAME);
  if (migrated.length > 0) {
    writeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME, JSON.stringify(migrated));
  }
  return migrated;
}

/**
 * Records that this account sent to this address, refreshing what resolution
 * found. An existing nickname survives — it is the one field the network has no
 * opinion about.
 */
export function saveAddressBookEntry(
  owner: StorageOwner,
  input: SaveAddressBookEntryInput,
): AddressBookEntry {
  const id = input.address.toLowerCase();
  const existing = readAddressBookEntries(owner);
  const entry: AddressBookEntry = {
    id,
    address: input.address,
    ensName: input.ensName,
    phone: input.phone,
    nickname: existing.find((item) => item.id === id)?.nickname ?? null,
    source: input.source,
  };
  const next = [entry, ...existing.filter((item) => item.id !== id)];
  writeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME, JSON.stringify(next));
  return entry;
}

/**
 * Sets or clears one entry's nickname, in place.
 *
 * In place because renaming is not a use: bumping "Mom" to the top of a list
 * ordered by who you last paid would make the order mean two different things.
 * A null nickname falls the name back to the resolved one.
 */
export function renameAddressBookEntry(
  owner: StorageOwner,
  id: string,
  nickname: string | null,
): void {
  const entries = readAddressBookEntries(owner);
  if (!entries.some((entry) => entry.id === id)) return;
  const next = entries.map((entry) => (entry.id === id ? { ...entry, nickname } : entry));
  writeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME, JSON.stringify(next));
}

export function removeAddressBookEntry(owner: StorageOwner, id: string): void {
  const next = readAddressBookEntries(owner).filter((entry) => entry.id !== id);
  writeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME, JSON.stringify(next));
}

export function clearAddressBookEntries(owner: StorageOwner): void {
  removeOwnerScoped(owner, ADDRESS_BOOK_STORAGE_NAME);
  removeOwnerScoped(owner, LEGACY_ADDRESS_BOOK_STORAGE_NAME);
}

function parseEntries(raw: string | null): AddressBookEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAddressBookEntry);
  } catch {
    return [];
  }
}

/**
 * Rebuilds `v1`'s single `label` into the fields it was standing in for, by
 * shape. A label equal to its own address carried no name at all — `v1` stored
 * the address there so the row had something to render — so it becomes no name
 * rather than a nickname reading `0x…`.
 */
function migrateLegacyEntries(raw: string | null): AddressBookEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLegacyEntry).map((legacy) => {
      const label = legacy.label.trim();
      const isOwnAddress = label.toLowerCase() === legacy.address.toLowerCase();
      return {
        id: legacy.address.toLowerCase(),
        address: legacy.address,
        ensName: !isOwnAddress && isEns(label) ? label : null,
        phone: !isOwnAddress && isPhone(label) ? label : null,
        nickname: !isOwnAddress && !isEns(label) && !isPhone(label) && label ? label : null,
        source: isAddressBookEntrySource(legacy.source) ? legacy.source : "manual",
      } satisfies AddressBookEntry;
    });
  } catch {
    return [];
  }
}

function isAddressBookEntry(value: unknown): value is AddressBookEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isHexAddress(value.address) &&
    isNullableString(value.ensName) &&
    isNullableString(value.phone) &&
    isNullableString(value.nickname) &&
    isAddressBookEntrySource(value.source)
  );
}

function isLegacyEntry(
  value: unknown,
): value is { label: string; address: `0x${string}`; source: unknown } {
  return isRecord(value) && typeof value.label === "string" && isHexAddress(value.address);
}

function isAddressBookEntrySource(value: unknown): value is AddressBookEntrySource {
  return (
    value === "manual" ||
    value === "phone" ||
    value === "ens" ||
    value === "reverse-ens" ||
    value === "qr"
  );
}

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
