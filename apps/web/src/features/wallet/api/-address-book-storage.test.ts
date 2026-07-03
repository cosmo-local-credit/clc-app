import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  clearAddressBookRecipients,
  readAddressBookRecipients,
  upsertAddressBookRecipient,
} from "./address-book-storage";

afterEach(() => {
  localStorage.clear();
});

describe("address book local storage", () => {
  it("persists recipients locally", () => {
    upsertAddressBookRecipient({
      label: "alice.sarafu.eth",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "ens",
    });

    expect(readAddressBookRecipients()).toEqual([
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
    upsertAddressBookRecipient({
      label: "Alice",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "manual",
    });
    upsertAddressBookRecipient({
      label: "alice.sarafu.eth",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "reverse-ens",
    });

    expect(readAddressBookRecipients()).toHaveLength(1);
    expect(readAddressBookRecipients()[0]).toMatchObject({
      label: "alice.sarafu.eth",
      source: "reverse-ens",
    });
  });

  it("can be reset by clearing the local address book", () => {
    upsertAddressBookRecipient({
      label: "+254711777734",
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      source: "phone",
    });

    clearAddressBookRecipients();

    expect(readAddressBookRecipients()).toEqual([]);
  });
});
