import { Trans, useLingui } from "@lingui/react/macro";
import { recipientLabel, type RecipientIdentity } from "@clc/api/features/recipients/client";
import { useEffect, useRef, useState } from "react";
import { RiQrScan2Line } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import type { AddressBookRecipientSource } from "#/features/wallet/api/address-book-storage";
import {
  useRecipientSearch,
  useReverseRecipientResolution,
} from "#/features/wallet/hooks/use-recipient-resolution";
import {
  isAddress,
  isPhone,
  normalizePhone,
  normalizeScannedRecipient,
} from "./recipient-validation";
import { EllipsizedAddress } from "./wallet-address";
import { CHAIN_ID } from "#/lib/chain";
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
  allowPools?: boolean;
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
  allowPools = false,
}: RecipientAddressInputProps) {
  const { t } = useLingui();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<{ query: string; identity: RecipientIdentity } | null>(
    null,
  );
  const previousQuery = useRef<string | null>(null);
  const [wasScanned, setWasScanned] = useState(false);
  const latestInputChange = useRef<string | undefined>(undefined);
  const recipientChange = useRef(onRecipientChange);
  const query = value ?? uncontrolledValue;
  const trimmedQuery = query.trim();
  const normalizedPhone = isPhone(query) ? normalizePhone(query) : null;
  const directAddress = isAddress(trimmedQuery) ? (trimmedQuery as `0x${string}`) : null;
  const reverseResolution = useReverseRecipientResolution(directAddress);
  const searchTerm = !directAddress && trimmedQuery !== "" ? trimmedQuery : null;
  const search = useRecipientSearch(searchTerm, allowPools);
  const currentSelection = selected?.query === trimmedQuery ? selected.identity : null;
  const recipient: ResolvedRecipientAddress | null = directAddress
    ? {
        name: reverseResolution.data ? recipientLabel(reverseResolution.data) : null,
        address: directAddress,
        source: reverseResolution.data ? "reverse-name" : wasScanned ? "qr" : "manual",
      }
    : currentSelection
      ? {
          name: recipientLabel(currentSelection),
          address: currentSelection.address,
          source: normalizedPhone ? "phone" : "alias",
        }
      : null;
  const resolutionError = searchTerm ? search.error : null;
  const matches =
    searchTerm && !currentSelection
      ? (search.data ?? []).filter((item) => item.chainId === CHAIN_ID || item.chainId === 0)
      : [];

  useEffect(() => {
    if (previousQuery.current !== query) setSelected(null);
    previousQuery.current = query;
  }, [query]);

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
    setSelected(null);
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
          dir="ltr"
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
          maxLength={120}
          disabled={disabled}
          className={cn("font-mono text-sm", className)}
        />
        <Button
          variant="outline"
          size="icon"
          tap
          aria-label={t`Scan QR`}
          disabled={disabled}
          onClick={() => setScannerOpen(true)}
        >
          <RiQrScan2Line className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {matches.length > 0 ? (
        <ul className="mt-3 border border-border bg-card" aria-label={t`Matching recipients`}>
          {matches.map((match) => (
            <li key={`${match.kind}:${match.chainId}:${match.address}`}>
              <button
                type="button"
                className="min-h-11 w-full border-b border-border px-3 py-2 text-start text-sm last:border-b-0"
                disabled={disabled}
                onClick={() => setSelected({ query: trimmedQuery, identity: match })}
              >
                <RecipientIdentityText identity={match} className="block" />
                <span className="block text-xs text-muted-foreground">
                  {match.kind === "pool" ? t`Pool` : t`Wallet`}
                </span>
                <EllipsizedAddress address={match.address} className="mt-1 block" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchTerm && !currentSelection && (search.isDebouncing || search.isFetching) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans>Searching recipients…</Trans>
        </p>
      ) : null}
      {searchTerm &&
      !currentSelection &&
      !search.isDebouncing &&
      search.isSuccess &&
      matches.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans>No matching recipients.</Trans>
        </p>
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

      {resolutionError ? (
        <p className="mt-3 text-destructive text-xs" role="alert">
          <Trans>Couldn't resolve that recipient.</Trans>
        </p>
      ) : null}
    </div>
  );
}
