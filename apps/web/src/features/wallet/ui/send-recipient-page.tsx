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
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import {
  useAddressBookRecipients,
  useUpsertAddressBookRecipient,
} from "#/features/wallet/hooks/use-address-book";
import { useAccountTransfersInfinite } from "#/features/wallet/hooks/use-account-balances";
import { recentSendRecipients } from "#/features/wallet/logic/recent-send-recipients";
import { AddressBookSheet } from "./address-book-sheet";
import { RecentRecipientRow } from "./recent-recipient-row";
import { RecipientAddressCard } from "./recipient-address-card";

export function SendRecipientPage({ token, amount }: { token?: string; amount?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recentRequested, setRecentRequested] = useState(false);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<ResolvedRecipientAddress | null>(null);
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipientAddress | null>(null);
  // One source of the owner per screen, threaded down — the same shape
  // `home-page.tsx` uses for `locationOwner`.
  const owner = useStorageOwner();
  const upsertRecipient = useUpsertAddressBookRecipient(owner);
  const wallet = owner !== null && owner !== GUEST_STORAGE_OWNER ? owner : undefined;
  const transfersQuery = useAccountTransfersInfinite(recentRequested ? wallet : undefined, {
    poll: false,
  });
  const addressBook = useAddressBookRecipients(owner);
  const labels = new Map(
    (addressBook.data ?? []).map((entry) => [entry.address.toLowerCase(), entry]),
  );
  const recent = recentSendRecipients(
    transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [],
    wallet,
  ).map((address): Recipient => {
    const savedEntry = labels.get(address.toLowerCase());
    const saved = savedEntry?.label;
    const named = saved !== undefined && !saved.toLowerCase().startsWith("0x");
    return {
      id: address.toLowerCase(),
      source: savedEntry?.source,
      label: named ? saved : address,
      address,
      seed: named ? saved : address,
    };
  });
  const recipient = resolvedRecipient?.name
    ? resolvedRecipient
    : (selectedRecipient ?? resolvedRecipient);
  const showRecent = query.trim() === "";

  function handleSelectRecipient(recipient: Recipient) {
    if (recipient.address) {
      setSelectedRecipient({
        name: recipient.label.startsWith("0x") ? null : recipient.label,
        address: recipient.address as `0x${string}`,
        source: recipient.source ?? "manual",
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
        <Trans>Enter a username, pool name, phone number or address.</Trans>
      </p>

      <div className="mb-2.5">
        <RecipientAddressInput
          id="send-recipient"
          allowPools
          value={query}
          onValueChange={handleInputChange}
          onRecipientChange={setResolvedRecipient}
          ariaLabel={t`Recipient username, pool name, phone or address`}
          className="font-mono text-sm"
        />
      </div>

      {showRecent && wallet !== undefined && !recentRequested ? (
        <Button
          variant="outline"
          className="mb-3 h-11 w-full"
          onClick={() => setRecentRequested(true)}
        >
          <Trans>Recent recipients</Trans>
        </Button>
      ) : null}

      {showRecent && recentRequested ? (
        <RecentRecipients
          recipients={recent}
          // A guest has no activity to read, and a read that never runs stays
          // pending — the list would say "Loading" forever.
          pending={wallet !== undefined && transfersQuery.isPending}
          failed={transfersQuery.isError}
          onRetry={() => {
            void transfersQuery.refetch();
          }}
          onSelect={handleSelectRecipient}
        />
      ) : null}

      <Button
        variant="outline"
        className="mb-3 h-11 w-full justify-between"
        onClick={() => setAddressBookOpen(true)}
      >
        <span className="inline-flex items-center gap-2">
          <RiGroupLine className="size-4" aria-hidden="true" />
          <Trans>Address book</Trans>
        </span>
        <RiArrowRightSLine className="rtl:-scale-x-100 size-4" aria-hidden="true" />
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

function RecentRecipients({
  recipients,
  pending,
  failed,
  onRetry,
  onSelect,
}: {
  recipients: readonly Recipient[];
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  onSelect: (recipient: Recipient) => void;
}) {
  if (!pending && !failed && recipients.length === 0) return null;

  return (
    <section aria-labelledby="recent-recipients" className="mb-3 space-y-1">
      <p id="recent-recipients" className="text-muted-foreground text-xs">
        <Trans>Recent recipients</Trans>
      </p>
      {pending ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Loading activity…</Trans>
        </p>
      ) : null}
      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive text-sm">
            <Trans>Couldn't load activity.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={onRetry}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {recipients.length > 0 ? (
        <ul className="border border-border bg-card">
          {recipients.map((recipient, index) => (
            <li
              key={recipient.id}
              className={index < recipients.length - 1 ? "border-b border-border" : undefined}
            >
              <RecentRecipientRow recipient={recipient} onSelect={() => onSelect(recipient)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
