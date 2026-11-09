import { recipientLabel, type RecipientIdentity } from "@clc/api/features/recipients/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { RiQrScan2Line, RiSearchLine } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";
import {
  isAddress,
  isPhone,
  normalizePhone,
  normalizeScannedRecipient,
} from "#/components/wallet/recipient-validation";
import {
  useRecipientSearch,
  useReverseRecipientResolution,
} from "#/features/wallet/hooks/use-recipient-resolution";
import { CHAIN_ID } from "#/lib/chain";

/**
 * The Send panel's To field: the phone's `RecipientAddressInput` resolution
 * (exact address, username, phone, pool name, QR scan) in the desktop shape —
 * search icon leading, scan trailing inside the one 36px field.
 */
export function SendRecipientField({
  id,
  value,
  onValueChange,
  onRecipientChange,
  ariaLabel,
  allowPools = true,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onRecipientChange: (recipient: ResolvedRecipientAddress | null) => void;
  ariaLabel: string;
  /** Send can pay a pool; a fee recipient must be a wallet, as on the phone. */
  allowPools?: boolean;
}) {
  const { t } = useLingui();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<{ query: string; identity: RecipientIdentity } | null>(
    null,
  );
  const [wasScanned, setWasScanned] = useState(false);
  const previousQuery = useRef<string | null>(null);
  const latestInputChange = useRef<string | undefined>(undefined);
  const recipientChange = useRef(onRecipientChange);
  const trimmedQuery = value.trim();
  const normalizedPhone = isPhone(value) ? normalizePhone(value) : null;
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
  const matches =
    searchTerm && !currentSelection
      ? (search.data ?? []).filter((item) => item.chainId === CHAIN_ID || item.chainId === 0)
      : [];

  useEffect(() => {
    if (previousQuery.current !== value) setSelected(null);
    previousQuery.current = value;
  }, [value]);

  const recipientKey = recipient
    ? `${recipient.address}:${recipient.name ?? ""}:${recipient.source}`
    : "none";
  const latestRecipient = useRef(recipient);
  latestRecipient.current = recipient;

  useEffect(() => {
    recipientChange.current = onRecipientChange;
  }, [onRecipientChange]);

  // A parent can replace the value (a recent chip, the address book). That is
  // not a scan, even when the previous input was.
  useEffect(() => {
    if (value !== latestInputChange.current) setWasScanned(false);
  }, [value]);

  useEffect(() => {
    recipientChange.current(latestRecipient.current);
  }, [recipientKey]);

  function setQuery(next: string, scanned = false) {
    setSelected(null);
    latestInputChange.current = next;
    setWasScanned(scanned);
    onValueChange(next);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="relative min-w-0">
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          dir="ltr"
          value={value}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={ariaLabel}
          placeholder={ariaLabel}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          className="truncate ps-8 pe-10 font-mono text-sm placeholder:font-sans"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 end-0"
          aria-label={t`Scan QR`}
          aria-expanded={scannerOpen}
          onClick={() => setScannerOpen((open) => !open)}
        >
          <RiQrScan2Line aria-hidden="true" />
        </Button>
      </div>

      {matches.length > 0 ? (
        <ul
          aria-label={t`Matching recipients`}
          className="divide-y divide-border border border-border bg-card"
        >
          {matches.map((match) => (
            <li key={`${match.kind}:${match.chainId}:${match.address}`} className="min-w-0">
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start hover:bg-muted"
                onClick={() => setSelected({ query: trimmedQuery, identity: match })}
              >
                <span className="min-w-0 flex-1">
                  <RecipientIdentityText
                    identity={match}
                    className="block truncate text-sm font-semibold"
                  />
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {formatVoucherAddress(match.address)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {match.kind === "pool" ? t`Pool` : t`Wallet`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchTerm && !currentSelection && (search.isDebouncing || search.isFetching) ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Searching recipients…</Trans>
        </p>
      ) : null}
      {searchTerm &&
      !currentSelection &&
      !search.isDebouncing &&
      search.isSuccess &&
      matches.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          <Trans>No matching recipients.</Trans>
        </p>
      ) : null}
      {searchTerm && search.error ? (
        <p className="text-xs text-destructive" role="alert">
          <Trans>Couldn't resolve that recipient.</Trans>
        </p>
      ) : null}

      {scannerOpen ? (
        <div className="border border-border bg-card p-3">
          <PaperWalletScanner
            title={<Trans>Scan recipient address</Trans>}
            onCancel={() => setScannerOpen(false)}
            onKeyDecoded={(scanned) => {
              setQuery(normalizeScannedRecipient(scanned), true);
              setScannerOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
