import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowRightSLine, RiGroupLine, RiQrScan2Line } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { type Recipient } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import type { AddressBookRecipientSource } from "#/features/wallet/api/address-book-storage";
import { useUpsertAddressBookRecipient } from "#/features/wallet/hooks/use-address-book";
import {
  useEnsRecipientResolution,
  usePhoneRecipientResolution,
  useReverseEnsResolution,
} from "#/features/wallet/hooks/use-recipient-resolution";
import { AddressBookSheet } from "./address-book-sheet";
import { RecipientAddressCard } from "./recipient-address-card";
import {
  isAddress,
  isEns,
  isEnsCandidate,
  isPhone,
  normalizePhone,
  normalizeScannedRecipient,
} from "./recipient-validation";

type ResolvedRecipient = {
  label: string;
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

export function SendRecipientPage({ token }: { token?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<ResolvedRecipient | null>(null);
  const upsertRecipient = useUpsertAddressBookRecipient();
  const trimmedQuery = query.trim();
  const normalizedPhone = isPhone(query) ? normalizePhone(query) : null;
  const ensName = isEns(trimmedQuery) ? trimmedQuery : null;
  const directAddress = isAddress(trimmedQuery) ? (trimmedQuery as `0x${string}`) : null;
  const phoneResolution = usePhoneRecipientResolution(normalizedPhone);
  const ensResolution = useEnsRecipientResolution(ensName);
  const reverseEnsResolution = useReverseEnsResolution(directAddress);
  const phoneResolvedAddress = normalizedPhone ? (phoneResolution.data?.address ?? null) : null;
  const phoneReverseEnsResolution = useReverseEnsResolution(phoneResolvedAddress);
  const ensSuggestions = useMemo(() => {
    if (!isEnsCandidate(query)) return [];
    return [`${trimmedQuery}.eth`, `${trimmedQuery}.sarafu.eth`];
  }, [query, trimmedQuery]);
  const resolvedRecipient: ResolvedRecipient | null =
    selectedRecipient ??
    (directAddress
      ? {
          label: reverseEnsResolution.data?.name ?? t`Address`,
          address: directAddress,
          source: reverseEnsResolution.data?.name ? "reverse-ens" : "manual",
        }
      : null) ??
    (ensName && ensResolution.data
      ? { label: ensName, address: ensResolution.data.address, source: "ens" }
      : null) ??
    (normalizedPhone && phoneResolution.data
      ? {
          label: phoneReverseEnsResolution.data?.name ?? normalizedPhone,
          address: phoneResolution.data.address,
          source: phoneReverseEnsResolution.data?.name ? "reverse-ens" : "phone",
        }
      : null);
  const isResolving =
    (Boolean(normalizedPhone) && phoneResolution.isPending) ||
    (Boolean(ensName) && ensResolution.isPending);
  const resolutionError = phoneResolution.error ?? ensResolution.error;

  function handleSelectRecipient(recipient: Recipient) {
    if (recipient.address) {
      setSelectedRecipient({
        label: recipient.label.startsWith("0x") ? t`Address` : recipient.label,
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

  function handleScanDecoded(value: string) {
    setSelectedRecipient(null);
    setQuery(normalizeScannedRecipient(value));
    setScannerOpen(false);
  }

  async function handleContinue() {
    if (!resolvedRecipient) return;
    await upsertRecipient.mutateAsync({
      label: resolvedRecipient.label,
      address: resolvedRecipient.address,
      source: resolvedRecipient.source,
    });
    void navigate({
      to: "/wallet/send/amount",
      search: {
        token,
        recipient: resolvedRecipient.address,
        recipientLabel: resolvedRecipient.label,
      },
    });
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} to="/" />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Send to</Trans>
      </h1>
      <p className="mt-1 mb-3.5 text-muted-foreground text-sm">
        <Trans>Enter an ENS, phone number or address.</Trans>
      </p>

      <div className="mb-2.5 flex gap-2">
        <Input
          value={query}
          onChange={(event) => handleInputChange(event.target.value)}
          aria-label={t`Recipient ENS, phone or address`}
          className="font-mono text-sm"
          placeholder={t`Search or enter`}
        />
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={t`Scan QR`}
          onClick={() => setScannerOpen(true)}
        >
          <RiQrScan2Line className="size-5" aria-hidden="true" />
        </Button>
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

      {ensSuggestions.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {ensSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="border border-border bg-card px-2.5 py-1.5 font-mono text-xs"
              onClick={() => setQuery(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {scannerOpen ? (
        <div className="mb-3.5 border border-border bg-card p-3">
          <PaperWalletScanner
            title={<Trans>Scan recipient address</Trans>}
            onCancel={() => setScannerOpen(false)}
            onKeyDecoded={handleScanDecoded}
          />
        </div>
      ) : null}

      {isResolving ? (
        <p className="mb-3.5 text-muted-foreground text-xs">
          <Trans>Resolving recipient…</Trans>
        </p>
      ) : null}

      {resolutionError ? (
        <p className="mb-3.5 text-destructive text-xs">
          <Trans>Couldn't resolve that recipient.</Trans>
        </p>
      ) : null}

      {resolvedRecipient ? (
        <RecipientAddressCard label={resolvedRecipient.label} address={resolvedRecipient.address} />
      ) : null}

      <div className="flex-1" />

      <Button
        className="mt-2.5 h-11 w-full"
        disabled={!resolvedRecipient || upsertRecipient.isPending}
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
      />
    </div>
  );
}
