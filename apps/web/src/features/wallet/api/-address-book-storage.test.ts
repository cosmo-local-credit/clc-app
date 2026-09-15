import { afterEach, describe, expect, it } from "vite-plus/test";

import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import {
  clearAddressBookRecipients,
  readAddressBookRecipients,
  upsertAddressBookRecipient,
} from "./address-book-storage";

const OWNER = "0xabc0000000000000000000000000000000000123";
const OTHER_OWNER = "0xdef0000000000000000000000000000000000456";

afterEach(() => {
  localStorage.clear();
});

describe("address book local storage", () => {
  it("persists recipients locally", () => {
    upsertAddressBookRecipient(OWNER, {
      label: "alice.sarafu.eth",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "ens",
    });

    expect(readAddressBookRecipients(OWNER)).toEqual([
      {
        id: "0xa316408425cf17f1827483dee621c6c3a9b5fad4",
        label: "alice.sarafu.eth",
        address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
        seed: "alice.sarafu.eth",
        source: "ens",
      },
    ]);
  });

  it("updates an existing address instead of duplicating it", () => {
    upsertAddressBookRecipient(OWNER, {
      label: "Alice",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "manual",
    });
    upsertAddressBookRecipient(OWNER, {
      label: "alice.sarafu.eth",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "reverse-ens",
    });

    expect(readAddressBookRecipients(OWNER)).toHaveLength(1);
    expect(readAddressBookRecipients(OWNER)[0]).toMatchObject({
      label: "alice.sarafu.eth",
      source: "reverse-ens",
    });
  });

  it("can be reset by clearing the local address book", () => {
    upsertAddressBookRecipient(OWNER, {
      label: "+254711777734",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "phone",
    });

    clearAddressBookRecipients(OWNER);

    expect(readAddressBookRecipients(OWNER)).toEqual([]);
  });

  // The leak this store existed with: one global list, so the next person to
  // sign in on a shared phone opened the send flow and saw the previous
  // person's contacts and their addresses.
  it("belongs to one account", () => {
    upsertAddressBookRecipient(OWNER, {
      label: "Alice",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "manual",
    });

    expect(readAddressBookRecipients(OTHER_OWNER)).toEqual([]);
    expect(readAddressBookRecipients(GUEST_STORAGE_OWNER)).toEqual([]);
    expect(readAddressBookRecipients(OWNER)).toHaveLength(1);
  });

  it("keeps each account's list when both are used on one device", () => {
    upsertAddressBookRecipient(OWNER, {
      label: "Alice",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "manual",
    });
    upsertAddressBookRecipient(OTHER_OWNER, {
      label: "Bob",
      address: "0xb316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "manual",
    });

    expect(readAddressBookRecipients(OWNER)[0]).toMatchObject({ label: "Alice" });
    expect(readAddressBookRecipients(OTHER_OWNER)[0]).toMatchObject({ label: "Bob" });

    // Clearing one account's book must not touch the other's.
    clearAddressBookRecipients(OWNER);
    expect(readAddressBookRecipients(OWNER)).toEqual([]);
    expect(readAddressBookRecipients(OTHER_OWNER)).toHaveLength(1);
  });
});
