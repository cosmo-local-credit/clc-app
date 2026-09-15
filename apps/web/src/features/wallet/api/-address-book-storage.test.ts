import { afterEach, describe, expect, it } from "vite-plus/test";

import { GUEST_STORAGE_OWNER, ownerScopedKey } from "#/lib/storage/owner-tier-key";
import {
  addressBookEntryName,
  clearAddressBookEntries,
  readAddressBookEntries,
  removeAddressBookEntry,
  renameAddressBookEntry,
  saveAddressBookEntry,
} from "./address-book-storage";

const OWNER = "0xabc0000000000000000000000000000000000123";
const OTHER_OWNER = "0xdef0000000000000000000000000000000000456";
const ALICE = "0xa316408425cF17F1827483dee621c6C3A9B5fad4";
const BOB = "0xb316408425cF17F1827483dee621c6C3A9B5fad4";

afterEach(() => {
  localStorage.clear();
});

function seedLegacyBook(owner: string, rows: unknown[]) {
  localStorage.setItem(ownerScopedKey(owner, "address-book.v1"), JSON.stringify(rows));
}

describe("address book local storage", () => {
  it("persists what resolution found", () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });

    expect(readAddressBookEntries(OWNER)).toEqual([
      {
        id: ALICE.toLowerCase(),
        address: ALICE,
        ensName: "alice.sarafu.eth",
        phone: null,
        nickname: null,
        source: "ens",
      },
    ]);
  });

  it("updates an existing address instead of duplicating it", () => {
    saveAddressBookEntry(OWNER, { address: ALICE, ensName: null, phone: null, source: "manual" });
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "reverse-ens",
    });

    expect(readAddressBookEntries(OWNER)).toHaveLength(1);
    expect(readAddressBookEntries(OWNER)[0]).toMatchObject({
      ensName: "alice.sarafu.eth",
      source: "reverse-ens",
    });
  });

  // The whole reason name and nickname are separate fields: with one `label`,
  // the next send overwrote whatever the user had called this person.
  it("keeps a nickname when a later save resolves a new name", () => {
    saveAddressBookEntry(OWNER, { address: ALICE, ensName: null, phone: null, source: "manual" });
    renameAddressBookEntry(OWNER, ALICE.toLowerCase(), "Mom");

    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "reverse-ens",
    });

    const [entry] = readAddressBookEntries(OWNER);
    expect(entry).toMatchObject({ nickname: "Mom", ensName: "alice.sarafu.eth" });
    expect(addressBookEntryName(entry)).toBe("Mom");
  });

  it("renames in place, leaving the resolved name and the order alone", () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    saveAddressBookEntry(OWNER, { address: BOB, ensName: null, phone: null, source: "manual" });

    renameAddressBookEntry(OWNER, ALICE.toLowerCase(), "Mom");

    const entries = readAddressBookEntries(OWNER);
    // Bob was saved last, so he stays at the head — renaming is not a use.
    expect(entries.map((entry) => entry.id)).toEqual([BOB.toLowerCase(), ALICE.toLowerCase()]);
    expect(entries[1]).toMatchObject({ nickname: "Mom", ensName: "alice.sarafu.eth" });
  });

  it("falls a cleared nickname back to the resolved name, not to the address", () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: "alice.sarafu.eth",
      phone: null,
      source: "ens",
    });
    renameAddressBookEntry(OWNER, ALICE.toLowerCase(), "Mom");
    renameAddressBookEntry(OWNER, ALICE.toLowerCase(), null);

    expect(addressBookEntryName(readAddressBookEntries(OWNER)[0])).toBe("alice.sarafu.eth");
  });

  it("names an entry by nickname, then resolved name, then phone, then nothing", () => {
    const base = {
      id: ALICE.toLowerCase(),
      address: ALICE as `0x${string}`,
      source: "manual" as const,
    };
    expect(
      addressBookEntryName({
        ...base,
        nickname: "Mom",
        ensName: "a.sarafu.eth",
        phone: "+254711777734",
      }),
    ).toBe("Mom");
    expect(
      addressBookEntryName({
        ...base,
        nickname: null,
        ensName: "a.sarafu.eth",
        phone: "+254711777734",
      }),
    ).toBe("a.sarafu.eth");
    expect(
      addressBookEntryName({ ...base, nickname: null, ensName: null, phone: "+254711777734" }),
    ).toBe("+254711777734");
    expect(
      addressBookEntryName({ ...base, nickname: null, ensName: null, phone: null }),
    ).toBeNull();
  });

  it("removes one entry and leaves the rest", () => {
    saveAddressBookEntry(OWNER, { address: ALICE, ensName: null, phone: null, source: "manual" });
    saveAddressBookEntry(OWNER, { address: BOB, ensName: null, phone: null, source: "manual" });

    removeAddressBookEntry(OWNER, ALICE.toLowerCase());

    expect(readAddressBookEntries(OWNER).map((entry) => entry.id)).toEqual([BOB.toLowerCase()]);
  });

  it("can be reset by clearing the local address book", () => {
    saveAddressBookEntry(OWNER, {
      address: ALICE,
      ensName: null,
      phone: "+254711777734",
      source: "phone",
    });

    clearAddressBookEntries(OWNER);

    expect(readAddressBookEntries(OWNER)).toEqual([]);
  });

  // v1 stored one `label` that was an ENS name, a phone number, or the address
  // repeated. Each has to land in the field it was standing in for.
  it("migrates v1 labels into the field each was standing in for", () => {
    seedLegacyBook(OWNER, [
      {
        id: ALICE.toLowerCase(),
        label: "alice.sarafu.eth",
        seed: "x",
        address: ALICE,
        source: "ens",
      },
      { id: BOB.toLowerCase(), label: "+254711777734", seed: "x", address: BOB, source: "phone" },
    ]);

    expect(readAddressBookEntries(OWNER)).toEqual([
      {
        id: ALICE.toLowerCase(),
        address: ALICE,
        ensName: "alice.sarafu.eth",
        phone: null,
        nickname: null,
        source: "ens",
      },
      {
        id: BOB.toLowerCase(),
        address: BOB,
        ensName: null,
        phone: "+254711777734",
        nickname: null,
        source: "phone",
      },
    ]);
    expect(localStorage.getItem(ownerScopedKey(OWNER, "address-book.v1"))).toBeNull();
  });

  it("migrates a v1 label that repeated its own address to no name at all", () => {
    seedLegacyBook(OWNER, [
      { id: ALICE.toLowerCase(), label: ALICE, seed: ALICE, address: ALICE, source: "manual" },
    ]);

    const [entry] = readAddressBookEntries(OWNER);
    expect(entry).toMatchObject({ ensName: null, phone: null, nickname: null });
    expect(addressBookEntryName(entry)).toBeNull();
  });

  it("migrates any other v1 label to a nickname", () => {
    seedLegacyBook(OWNER, [
      { id: ALICE.toLowerCase(), label: "Mom", seed: "Mom", address: ALICE, source: "manual" },
    ]);

    expect(readAddressBookEntries(OWNER)[0]).toMatchObject({ nickname: "Mom", ensName: null });
  });

  // The leak this store existed with: one global list, so the next person to
  // sign in on a shared phone opened the send flow and saw the previous
  // person's contacts and their addresses.
  it("belongs to one account", () => {
    saveAddressBookEntry(OWNER, { address: ALICE, ensName: null, phone: null, source: "manual" });

    expect(readAddressBookEntries(OTHER_OWNER)).toEqual([]);
    expect(readAddressBookEntries(GUEST_STORAGE_OWNER)).toEqual([]);
    expect(readAddressBookEntries(OWNER)).toHaveLength(1);
  });

  it("keeps each account's list when both are used on one device", () => {
    saveAddressBookEntry(OWNER, { address: ALICE, ensName: null, phone: null, source: "manual" });
    renameAddressBookEntry(OWNER, ALICE.toLowerCase(), "Mom");
    saveAddressBookEntry(OTHER_OWNER, {
      address: BOB,
      ensName: null,
      phone: null,
      source: "manual",
    });
    renameAddressBookEntry(OTHER_OWNER, BOB.toLowerCase(), "Bob");

    expect(readAddressBookEntries(OWNER)[0]).toMatchObject({ nickname: "Mom" });
    expect(readAddressBookEntries(OTHER_OWNER)[0]).toMatchObject({ nickname: "Bob" });

    // Clearing one account's book must not touch the other's.
    clearAddressBookEntries(OWNER);
    expect(readAddressBookEntries(OWNER)).toEqual([]);
    expect(readAddressBookEntries(OTHER_OWNER)).toHaveLength(1);
  });
});
