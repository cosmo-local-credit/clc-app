import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowRightSLine, RiGroupLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  RecipientAddressInput,
  type ResolvedRecipientAddress,
} from "#/components/wallet/recipient-address-input";
import { type Recipient } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useUpsertAddressBookRecipient } from "#/features/wallet/hooks/use-address-book";
import { AddressBookSheet } from "./address-book-sheet";
import { RecipientAddressCard } from "./recipient-address-card";

export function SendRecipientPage({ token, amount }: { token?: string; amount?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<ResolvedRecipientAddress | null>(null);
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipientAddress | null>(null);
  // One source of the owner per screen, threaded down — the same shape
  // `home-page.tsx` uses for `locationOwner`.
  const owner = useStorageOwner();
  const upsertRecipient = useUpsertAddressBookRecipient(owner);
  const recipient = selectedRecipient ?? resolvedRecipient;

  function handleSelectRecipient(recipient: Recipient) {
    if (recipient.address) {
      setSelectedRecipient({
        name: recipient.label.startsWith("0x") ? null : recipient.label,
        address: recipient.address as `0x${string}`,
        source: "manual",
      });
      setQuery(recipient.address);
      return;
    }
    setSelectedRecipient(null);
    setQuery(recipient.label);
  }

  function handleInputChange(value: string) {
    setSelectedRecipient(null);
    setQuery(value);
  }

  async function handleContinue() {
    if (!recipient) return;
    // A nameless recipient is stored under its own address; the address book
    // row renders that as an ellipsized address, and nothing persists a
    // placeholder word that could later masquerade as a name.
    await upsertRecipient.mutateAsync({
      label: recipient.name ?? recipient.address,
      address: recipient.address,
      source: recipient.source,
    });
    void navigate({
      to: "/wallet/send/amount",
      search: {
        token,
        amount,
        recipient: recipient.address,
        recipientLabel: recipient.name ?? undefined,
      },
    });
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Send to</Trans>
      </h1>
      <p className="mt-1 mb-3.5 text-muted-foreground text-sm">
        <Trans>Enter an ENS, phone number or address.</Trans>
      </p>

      <div className="mb-2.5">
        <RecipientAddressInput
          id="send-recipient"
          value={query}
          onValueChange={handleInputChange}
          onRecipientChange={setResolvedRecipient}
          ariaLabel={t`Recipient ENS, phone or address`}
          className="font-mono text-sm"
        />
      </div>

      <Button
        variant="outline"
        className="mb-3 h-11 w-full justify-between"
        onClick={() => setAddressBookOpen(true)}
      >
        <span className="inline-flex items-center gap-2">
          <RiGroupLine className="size-4" aria-hidden="true" />
          <Trans>Address book</Trans>
        </span>
        <RiArrowRightSLine className="size-4" aria-hidden="true" />
      </Button>

      {recipient ? (
        <RecipientAddressCard label={recipient.name ?? t`Address`} address={recipient.address} />
      ) : null}

      <div className="flex-1" />

      <Button
        className="mt-2.5 h-11 w-full"
        disabled={!recipient || upsertRecipient.isPending}
        onClick={() => {
          void handleContinue();
        }}
      >
        {t`Continue`}
      </Button>

      <AddressBookSheet
        open={addressBookOpen}
        onOpenChange={setAddressBookOpen}
        onSelect={handleSelectRecipient}
        owner={owner}
      />
    </div>
  );
}
