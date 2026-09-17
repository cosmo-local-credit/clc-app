import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiQrScan2Line } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { AddressBookRecipientSource } from "#/features/wallet/api/address-book-storage";
import {
  useEnsRecipientResolution,
  usePhoneRecipientResolution,
  useReverseEnsResolution,
} from "#/features/wallet/hooks/use-recipient-resolution";
import {
  isAddress,
  isEns,
  isEnsCandidate,
  isPhone,
  normalizePhone,
  normalizeScannedRecipient,
} from "./recipient-validation";
import { cn } from "#/lib/utils";

export type ResolvedRecipientAddress = {
  /** A resolved name, or null when the user supplied only an address. */
  name: string | null;
  address: `0x${string}`;
  source: AddressBookRecipientSource;
};

type RecipientAddressInputProps = {
  /**
   * The text currently shown in the input. Supplying it makes the input
   * controlled; otherwise it maintains its own display value.
   */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Receives a contract-ready address after direct entry, name lookup, or scanning. */
  onRecipientChange?: (recipient: ResolvedRecipientAddress | null) => void;
  onBlur?: () => void;
  id: string;
  ariaLabel: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * The single mobile address entry control used for any person-controlled
 * destination. It keeps a familiar search/scan surface while always returning
 * a resolved wallet address to the enclosing form or action.
 */
export function RecipientAddressInput({
  value,
  defaultValue = "",
  onValueChange,
  onRecipientChange,
  onBlur,
  id,
  ariaLabel,
  ariaInvalid,
  disabled,
  className,
}: RecipientAddressInputProps) {
  const { t } = useLingui();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [wasScanned, setWasScanned] = useState(false);
  const latestInputChange = useRef<string | undefined>(undefined);
  const recipientChange = useRef(onRecipientChange);
  const query = value ?? uncontrolledValue;
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
  const recipient: ResolvedRecipientAddress | null =
    (directAddress
      ? {
          name: reverseEnsResolution.data?.name ?? null,
          address: directAddress,
          source: reverseEnsResolution.data?.name ? "reverse-ens" : wasScanned ? "qr" : "manual",
        }
      : null) ??
    (ensName && ensResolution.data
      ? { name: ensName, address: ensResolution.data.address, source: "ens" }
      : null) ??
    (normalizedPhone && phoneResolution.data
      ? {
          name: phoneReverseEnsResolution.data?.name ?? normalizedPhone,
          address: phoneResolution.data.address,
          source: phoneReverseEnsResolution.data?.name ? "reverse-ens" : "phone",
        }
      : null);
  const isResolving =
    (Boolean(normalizedPhone) && phoneResolution.isPending) ||
    (Boolean(ensName) && ensResolution.isPending);
  const resolutionError = phoneResolution.error ?? ensResolution.error;
  const recipientKey = recipient
    ? `${recipient.address}:${recipient.name ?? ""}:${recipient.source}`
    : "none";
  const latestRecipient = useRef(recipient);
  latestRecipient.current = recipient;

  useEffect(() => {
    recipientChange.current = onRecipientChange;
  }, [onRecipientChange]);

  // A parent can replace a controlled value (for example, from the address
  // book). That is not a scan, even when the previous input was.
  useEffect(() => {
    if (value !== undefined && value !== latestInputChange.current) setWasScanned(false);
  }, [value]);

  useEffect(() => {
    recipientChange.current?.(latestRecipient.current);
  }, [recipientKey]);

  function setQuery(next: string, scanned = false) {
    latestInputChange.current = next;
    setWasScanned(scanned);
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  }

  function handleScanDecoded(scanned: string) {
    setQuery(normalizeScannedRecipient(scanned), true);
    setScannerOpen(false);
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          placeholder={t`Search or enter`}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className={cn("font-mono text-sm", className)}
        />
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={t`Scan QR`}
          disabled={disabled}
          onClick={() => setScannerOpen(true)}
        >
          <RiQrScan2Line className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {ensSuggestions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ensSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="border border-border bg-card px-2.5 py-1.5 font-mono text-xs"
              disabled={disabled}
              onClick={() => setQuery(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {scannerOpen ? (
        <div className="mt-3 border border-border bg-card p-3">
          <PaperWalletScanner
            title={<Trans>Scan recipient address</Trans>}
            onCancel={() => setScannerOpen(false)}
            onKeyDecoded={handleScanDecoded}
          />
        </div>
      ) : null}

      {isResolving ? (
        <p className="mt-3 text-muted-foreground text-xs">
          <Trans>Resolving recipient…</Trans>
        </p>
      ) : null}

      {resolutionError ? (
        <p className="mt-3 text-destructive text-xs" role="alert">
          <Trans>Couldn't resolve that recipient.</Trans>
        </p>
      ) : null}
    </div>
  );
}
