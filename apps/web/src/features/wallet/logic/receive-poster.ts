import { formatVoucherAddress } from "@clc/core/features/catalog/logic";

/**
 * A link that opens Send with this wallet already chosen as the recipient.
 *
 * It carries the address only. The amount step resolves the name itself, so a
 * forwarded link cannot put someone else's name on this address.
 */
export function receivePayLink(origin: string, address: `0x${string}`): string {
  const url = new URL("/wallet/send/amount", origin);
  url.searchParams.set("recipient", address);
  return url.toString();
}

export type ReceivePosterIdentity = {
  /** The line under the QR: the name, else the username, else the short address. */
  title: string;
  /** The title is a username or an address, which is set in mono and kept LTR. */
  titleIsCode: boolean;
  /** The username and short address not already used as the title, joined. */
  detail: string | null;
};

/** Who the poster pays, as the two lines printed under its QR. */
export function receivePosterIdentity({
  name,
  username,
  address,
}: {
  name: string | null;
  username: string | null;
  address: `0x${string}`;
}): ReceivePosterIdentity {
  const shortAddress = formatVoucherAddress(address);
  const trimmedName = name?.trim() || null;
  const trimmedUsername = username?.trim() || null;
  if (trimmedName) {
    return {
      title: trimmedName,
      titleIsCode: false,
      detail: [trimmedUsername, shortAddress].filter(Boolean).join(" · "),
    };
  }
  if (trimmedUsername) {
    return { title: trimmedUsername, titleIsCode: true, detail: shortAddress };
  }
  return { title: shortAddress, titleIsCode: true, detail: null };
}

const RTL_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/**
 * The direction of a user-written string, from its first letter: the canvas
 * counterpart of `dir="auto"`, which a 2D context has no way to express.
 */
export function firstStrongDirection(text: string): "ltr" | "rtl" {
  const letter = text.match(/\p{L}/u)?.[0];
  return letter && RTL_SCRIPT.test(letter) ? "rtl" : "ltr";
}
