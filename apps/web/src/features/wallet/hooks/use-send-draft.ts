import { useEffect } from "react";

import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";
import { useViewDraft, type ViewDraft } from "#/lib/view-drafts";

/**
 * What Send carries across the phone/desktop view swap. The phone's two pages
 * and the desktop's one panel all read and write this one shape, so a switch on
 * either side lands the same recipient, amount and voucher on the other.
 *
 * Plain field values only. The review step (`confirmOpen`) and the "Max"
 * amount are deliberately not here: a payment that was armed before the switch
 * must be armed again by a person, and a restored amount is validated against
 * the live balance instead of a snapshot of it.
 */
export type SendDraft = {
  /** What is in the recipient field: a name, a phone, or an address. */
  query: string;
  /** Who that resolved to or was picked as, when it did. */
  recipient?: ResolvedRecipientAddress;
  amount: string;
  /** The voucher the person chose (its id: the lowercased contract address). */
  token?: string;
};

/** Send's draft for one signed-in account; a guest (no address) keeps none. */
export function useSendDraft(account: string | undefined): ViewDraft<SendDraft> {
  return useViewDraft<SendDraft>({ scope: "send", account });
}

/**
 * Mirrors the Send fields into the draft on every change, and forgets the
 * draft when there is nothing left worth carrying over.
 *
 * Only primitives go in; the recipient is rebuilt from its parts so a changing
 * object identity does not re-run the effect.
 */
export function useKeepSendDraft(
  draft: Pick<ViewDraft<SendDraft>, "save" | "clear">,
  fields: {
    query: string;
    recipient: ResolvedRecipientAddress | null;
    amount: string;
    token: string | undefined;
  },
) {
  const { save, clear } = draft;
  const { query, amount, token } = fields;
  const address = fields.recipient?.address;
  const name = fields.recipient?.name ?? null;
  const source = fields.recipient?.source;
  useEffect(() => {
    if (query.trim() === "" && !address && amount === "" && token === undefined) {
      clear();
      return;
    }
    save({
      query,
      recipient: address && source ? { address, name, source } : undefined,
      amount,
      token,
    });
  }, [address, amount, clear, name, query, save, source, token]);
}
