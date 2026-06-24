import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowRightSLine, RiGroupLine, RiQrScan2Line } from "react-icons/ri";

import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { EllipsizedAddress } from "#/components/wallet";
import { RECENT_RECIPIENTS, type Recipient } from "#/components/wallet/wallet-data";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { cn } from "#/lib/utils";

const RESOLVED_ENS_ADDRESS = "0x91Ab3f5d6C7e8F9a0B1c2D3e4F5a6B7c8D9e0d2E7";
const RESOLVED_PHONE_ADDRESS = "0x3C8f21A9D4b7e6F0a2C5d8E1B4f7A0c3D6e9F102";

type ResolvedRecipient = {
  label: string;
  address: string;
};

function formatAddressInput(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, "");
}

function normalizeScannedRecipient(value: string): string {
  const address = value.match(/0x\S{40}/)?.[0];
  return address ?? value.trim();
}

function isAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") && trimmed.length === 42;
}

function isPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return /^\+254\d{9}$/.test(normalized) || /^0\d{9}$/.test(normalized);
}

function isEns(value: string): boolean {
  return /^[a-zA-Z0-9-]+\.(eth|sarafu\.eth)$/.test(value.trim());
}

function isEnsCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  if (trimmed.includes(".")) return false;
  if (trimmed.toLowerCase().startsWith("0x")) return false;
  if (normalizePhone(trimmed).startsWith("+254")) return false;
  if (/^\d[\d\s-]{2}/.test(trimmed)) return false;
  return /^[a-zA-Z0-9-]+$/.test(trimmed);
}

function RecipientAddressCard({ label, address }: { label: string; address: string }) {
  return (
    <div className="mb-3.5 border border-primary/30 bg-primary/5 p-3">
      <p className="font-semibold text-sm">{label}</p>
      <div className="mt-1 min-w-0 break-all">
        <EllipsizedAddress address={address} />
      </div>
    </div>
  );
}

function RecentRecipientRow({
  recipient,
  onSelect,
}: {
  recipient: Recipient;
  onSelect: () => void;
}) {
  const { t } = useLingui();

  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center p-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="break-all font-medium text-sm">
          {recipient.address && recipient.label.startsWith("0x") ? t`Address` : recipient.label}
        </p>
        {recipient.address ? (
          <div className="mt-1 min-w-0 break-all">
            <EllipsizedAddress address={recipient.address} />
          </div>
        ) : (
          <p className="break-all font-mono text-muted-foreground text-xs">{recipient.sub}</p>
        )}
      </div>
      <RiArrowRightSLine
        className="ml-2 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

function AddressBookSheet({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (recipient: Recipient) => void;
}) {
  const { t } = useLingui();

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Address book</Trans>
            </SheetTitle>
          </SheetHeader>
          {/* Replace this static set with a TanStack Query + TanStack Virtual powered infinite address-book list when backend pagination is wired. */}
          <div className="flex-1 overflow-y-auto px-3">
            {RECENT_RECIPIENTS.map((recipient, index, list) => (
              <div
                key={recipient.id}
                className={cn(index < list.length - 1 && "border-b border-border")}
              >
                <RecentRecipientRow
                  recipient={recipient}
                  onSelect={() => {
                    onSelect(recipient);
                    onOpenChange(false);
                  }}
                />
              </div>
            ))}
          </div>
          <SheetFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 w-full font-medium text-foreground text-sm hover:underline"
            >
              {t`Cancel`}
            </button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

export function SendRecipientPage() {
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

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} onClick={() => window.history.back()} />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Send to</Trans>
      </h1>
      <p className="mt-1 mb-3.5 text-muted-foreground text-sm">
        <Trans>Enter an ENS, phone number or address.</Trans>
      </p>

      <div className="mb-2.5 flex gap-2">
        <Input
          value={inputValue}
          onChange={(event) => {
            setSelectedRecipient(null);
            setQuery(event.target.value);
          }}
          aria-label={t`Recipient ENS, phone or address`}
          className="h-12 font-mono text-sm"
          placeholder={t`Search or enter`}
        />
        <Button
          variant="outline"
          size="icon-lg"
          className="h-12 w-12 shrink-0"
          aria-label={t`Scan QR`}
          onClick={() => setScannerOpen(true)}
        >
          <RiQrScan2Line className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <Button
        variant="outline"
        className="mb-3 h-12 w-full justify-between"
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
            onKeyDecoded={(value) => {
              setSelectedRecipient(null);
              setQuery(normalizeScannedRecipient(value));
              setScannerOpen(false);
            }}
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
          void navigate({ to: "/wallet/send/amount" });
        }}
      >
        {t`Continue`}
      </Button>

      <AddressBookSheet
        open={addressBookOpen}
        onOpenChange={setAddressBookOpen}
        onSelect={(recipient) => {
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
        }}
      />
    </div>
  );
}
