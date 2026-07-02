import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowRightSLine, RiGroupLine, RiQrScan2Line } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { type Recipient } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { AddressBookSheet } from "./address-book-sheet";
import { RecipientAddressCard } from "./recipient-address-card";
import {
  formatAddressInput,
  isAddress,
  isEns,
  isEnsCandidate,
  isPhone,
  normalizePhone,
  normalizeScannedRecipient,
} from "./recipient-validation";

const RESOLVED_ENS_ADDRESS = "0x91Ab3f5d6C7e8F9a0B1c2D3e4F5a6B7c8D9e0d2E7";
const RESOLVED_PHONE_ADDRESS = "0x3C8f21A9D4b7e6F0a2C5d8E1B4f7A0c3D6e9F102";

type ResolvedRecipient = {
  label: string;
  address: string;
};

export function SendRecipientPage({ token }: { token?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<ResolvedRecipient | null>(null);
  const trimmedQuery = query.trim();
  const ensSuggestions = useMemo(() => {
    if (!isEnsCandidate(query)) return [];
    return [`${trimmedQuery}.eth`, `${trimmedQuery}.sarafu.eth`];
  }, [query, trimmedQuery]);
  const resolvedEnsAddress = isEns(trimmedQuery) ? RESOLVED_ENS_ADDRESS : null;
  const directAddress = isAddress(trimmedQuery) ? trimmedQuery : null;
  const validPhone = isPhone(query);
  const resolvedPhoneAddress = validPhone ? RESOLVED_PHONE_ADDRESS : null;
  const resolvedRecipient: ResolvedRecipient | null =
    selectedRecipient ??
    (directAddress ? { label: t`Address`, address: directAddress } : null) ??
    (resolvedEnsAddress ? { label: trimmedQuery, address: resolvedEnsAddress } : null) ??
    (resolvedPhoneAddress ? { label: normalizePhone(query), address: resolvedPhoneAddress } : null);
  const inputValue = resolvedRecipient ? formatAddressInput(resolvedRecipient.address) : query;

  function handleSelectRecipient(recipient: Recipient) {
    if (recipient.address) {
      setSelectedRecipient({
        label: recipient.label.startsWith("0x") ? t`Address` : recipient.label,
        address: recipient.address,
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
          value={inputValue}
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

      {resolvedRecipient ? (
        <RecipientAddressCard label={resolvedRecipient.label} address={resolvedRecipient.address} />
      ) : null}

      <div className="flex-1" />

      <Button
        className="mt-2.5 h-11 w-full"
        onClick={() => {
          void navigate({ to: "/wallet/send/amount", search: { token } });
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
