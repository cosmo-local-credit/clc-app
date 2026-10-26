import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RiArrowRightSLine, RiGroupLine } from "react-icons/ri";
import { getAddress, isAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { TokenLogo, WalletAmountInput, type WalletToken } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import {
  RecipientAddressInput,
  type ResolvedRecipientAddress,
} from "#/components/wallet/recipient-address-input";
import type { Recipient } from "#/components/wallet/wallet-data";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import {
  useAddressBookRecipients,
  useUpsertAddressBookRecipient,
} from "#/features/wallet/hooks/use-address-book";
import {
  useAccountTransfersInfinite,
  useAllAccountTokens,
} from "#/features/wallet/hooks/use-account-balances";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { recentSendRecipients } from "#/features/wallet/logic/recent-send-recipients";
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
import { AddressBookSheet } from "#/features/wallet/ui/address-book-sheet";
import { RecentRecipientRow } from "#/features/wallet/ui/recent-recipient-row";
import { RecipientAddressCard } from "#/features/wallet/ui/recipient-address-card";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

function hexAddress(value: unknown): `0x${string}` | undefined {
  return typeof value === "string" && isAddress(value) ? getAddress(value) : undefined;
}

function readSendLocation(search: unknown) {
  if (typeof search !== "object" || search === null) return {};
  const value = search as Record<string, unknown>;
  return {
    to: hexAddress(value.to),
    token: typeof value.token === "string" ? value.token : undefined,
    amount: typeof value.amount === "string" ? value.amount : undefined,
    recipient: hexAddress(value.recipient),
    recipientLabel: typeof value.recipientLabel === "string" ? value.recipientLabel : undefined,
    returnPool: typeof value.returnPool === "string" ? value.returnPool : undefined,
  };
}

export function SendDesk({
  step,
  token,
  amount: amountProp,
  to,
}: {
  step: "recipient" | "amount";
  token?: string;
  amount?: string;
  to?: `0x${string}`;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  const route = readSendLocation(locationSearch);
  const seededTo = to ?? route.to ?? route.recipient;
  const seededToken = (token ?? route.token)?.toLowerCase();
  const seededLabel =
    route.recipientLabel &&
    route.recipient &&
    seededTo &&
    route.recipient.toLowerCase() === seededTo.toLowerCase()
      ? route.recipientLabel
      : undefined;
  const returnPool = route.returnPool;
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address);
  const tokensQuery = useAllAccountTokens(address);
  const sendVoucher = useSendVoucherTransfer();
  const tokens = tokensQuery.tokens
    .filter((item) => item.catalogActive !== false)
    .map(accountTokenToWalletToken);
  const [selectedId, setSelectedId] = useState<string | undefined>(seededToken);
  const selectedToken = selectedId ? tokens.find((item) => item.id === selectedId) : tokens[0];
  const firstTokenId = tokens[0]?.id;
  useEffect(() => {
    if (!selectedId && firstTokenId) setSelectedId(firstTokenId);
  }, [selectedId, firstTokenId]);
  const [amount, setAmount] = useState(() => sanitizeAmount(amountProp ?? route.amount ?? ""));
  const [maxAmountRaw, setMaxAmountRaw] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [query, setQuery] = useState(seededTo ?? "");
  const [selectedRecipient, setSelectedRecipient] = useState<ResolvedRecipientAddress | null>(
    seededTo
      ? {
          name: seededLabel && !seededLabel.toLowerCase().startsWith("0x") ? seededLabel : null,
          address: seededTo,
          source: "manual",
        }
      : null,
  );
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipientAddress | null>(null);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const owner = useStorageOwner();
  const upsertRecipient = useUpsertAddressBookRecipient(owner);
  const wallet = owner !== null && owner !== GUEST_STORAGE_OWNER ? owner : undefined;
  const transfersQuery = useAccountTransfersInfinite(wallet, { poll: false });
  const addressBook = useAddressBookRecipients(owner);
  const labels = new Map(
    (addressBook.data ?? []).map((entry) => [entry.address.toLowerCase(), entry]),
  );
  const recent = recentSendRecipients(
    transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [],
    wallet,
  ).map((recentAddress): Recipient => {
    const savedEntry = labels.get(recentAddress.toLowerCase());
    const saved = savedEntry?.label;
    const named = saved !== undefined && !saved.toLowerCase().startsWith("0x");
    return {
      id: recentAddress.toLowerCase(),
      source: savedEntry?.source,
      label: named ? saved : recentAddress,
      address: recentAddress,
      seed: named ? saved : recentAddress,
    };
  });
  const recipient = resolvedRecipient?.name
    ? resolvedRecipient
    : (selectedRecipient ?? resolvedRecipient);
  useDeskTrailLabel(recipient?.name ?? null);
  const showRecent = query.trim() === "";
  const tokenDecimals = selectedToken?.tokenDecimals ?? 2;
  const voucherDetail = useMarketVoucherDetail(selectedToken?.contractAddress);
  const parsedAmountRaw = useMemo(() => {
    if (!selectedToken || amount.trim() === "") return null;
    try {
      return maxAmountRaw ?? parseTokenAmount(amount, tokenDecimals);
    } catch {
      return null;
    }
  }, [amount, maxAmountRaw, selectedToken, tokenDecimals]);
  const exactVoucherAmount =
    parsedAmountRaw === null
      ? null
      : formatTokenAmount(parsedAmountRaw, tokenDecimals, tokenDecimals);
  const submittedVoucherAmount = maxAmountRaw ? (exactVoucherAmount ?? amount) : amount;
  const unitValue =
    exactVoucherAmount === null
      ? null
      : formatVoucherUnitValue(
          exactVoucherAmount,
          voucherDetail.data?.voucherValue ?? null,
          voucherDetail.data?.voucherUoa ?? null,
        );
  const localizedUnitValue = unitValue
    ? (formatUnitOfAccountDisplayValue(unitValue.value, i18n.locales?.[0] ?? i18n.locale) ??
      unitValue.value)
    : null;
  const unitValueLabel =
    exactVoucherAmount === null
      ? null
      : unitValue && localizedUnitValue
        ? `${localizedUnitValue} ${unitValue.unit}`
        : voucherDetail.isPending
          ? t`Loading…`
          : t`Unavailable`;
  const balanceRaw = selectedToken?.balance ?? null;
  const amountValue = Number(amount);
  const isValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    parsedAmountRaw !== null &&
    BigInt(parsedAmountRaw) > 0n;
  const exceedsMax =
    isValidAmount && balanceRaw !== null
      ? BigInt(parsedAmountRaw) > BigInt(balanceRaw)
      : selectedToken
        ? amountValue > Number(selectedToken.amount.replace(/,/g, ""))
        : false;
  const recipientAddress = recipient?.address ?? null;
  const tokenAddress =
    selectedToken?.contractAddress && isAddress(selectedToken.contractAddress)
      ? getAddress(selectedToken.contractAddress)
      : null;
  const canSend =
    !!address &&
    !!recipientAddress &&
    !!tokenAddress &&
    !!selectedToken &&
    delegationStatus !== "checking" &&
    isValidAmount &&
    !exceedsMax;
  const loadingTokens = Boolean(address) && tokensQuery.isPending;
  const columns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "token",
        header: t`Holdings`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <TokenLogo token={row} size={20} />
            <span className="truncate text-sm font-semibold">{row.symbol}</span>
            <span className="truncate text-xs text-muted-foreground">{row.name}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "8rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );

  function handleSelectRecipient(next: Recipient) {
    const nextAddress = hexAddress(next.address);
    if (nextAddress) {
      setSelectedRecipient({
        name: next.label.startsWith("0x") ? null : next.label,
        address: nextAddress,
        source: next.source ?? "manual",
      });
      setQuery(nextAddress);
      return;
    }
    setSelectedRecipient(null);
    setQuery(next.label);
  }

  async function openReview() {
    if (!recipient || !canSend) return;
    const saved = await upsertRecipient
      .mutateAsync({
        label: recipient.name ?? recipient.address,
        address: recipient.address,
        source: recipient.source,
      })
      .catch(() => "failed" as const);
    if (saved === "failed") return;
    setConfirmOpen(true);
  }

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        dimmed
        main={
          <div className="p-6">
            <DeskTable
              label={t`Holdings`}
              rows={tokens}
              columns={columns}
              rowKey={(row) => row.id}
              selectedKey={selectedToken?.id}
              onSelect={(row) => {
                setMaxAmountRaw(null);
                setSelectedId(row.id);
              }}
              empty={
                !address ? (
                  <Trans>No wallet address available.</Trans>
                ) : loadingTokens ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    <Trans>Loading tokens…</Trans>
                  </span>
                ) : tokensQuery.isError ? (
                  <span className="inline-flex flex-col items-start gap-2">
                    <Trans>Couldn't load tokens</Trans>
                    <Button
                      type="button"
                      variant="outline"
                      pending={tokensQuery.isFetching}
                      onClick={() => void tokensQuery.refetch()}
                    >
                      <Trans>Try again</Trans>
                    </Button>
                  </span>
                ) : (
                  <Trans>No tokens available</Trans>
                )
              }
            />
          </div>
        }
        side={
          <DeskInspector
            title={<Trans>Send</Trans>}
            footer={
              <Button
                type="button"
                className="w-full"
                disabled={!canSend}
                pending={upsertRecipient.isPending}
                onClick={() => void openReview()}
              >
                <Trans>Send</Trans>
              </Button>
            }
          >
            <div className="space-y-3">
              <RecipientAddressInput
                id="send-recipient"
                allowPools
                value={query}
                onValueChange={(value) => {
                  setSelectedRecipient(null);
                  setQuery(value);
                }}
                onRecipientChange={setResolvedRecipient}
                ariaLabel={t`Recipient username, pool name, phone or address`}
                className="font-mono text-sm"
              />
              {recipient ? (
                <RecipientAddressCard
                  label={recipient.name ?? t`Address`}
                  address={recipient.address}
                />
              ) : null}
              {showRecent && wallet !== undefined ? (
                <RecentList
                  recipients={recent}
                  pending={transfersQuery.isPending}
                  failed={transfersQuery.isError}
                  retrying={transfersQuery.isFetching}
                  onRetry={() => void transfersQuery.refetch()}
                  onSelect={handleSelectRecipient}
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setAddressBookOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <RiGroupLine className="size-4" aria-hidden="true" />
                  <Trans>Address book</Trans>
                </span>
                <RiArrowRightSLine className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
              {selectedToken ? (
                <div className="flex items-center gap-2 border border-border bg-card px-3 py-2">
                  <TokenLogo token={selectedToken} size={20} />
                  <span className="text-sm font-semibold">{selectedToken.symbol}</span>
                  <span className="ms-auto font-heading font-semibold tracking-tight" dir="ltr">
                    {selectedToken.amount}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loadingTokens ? (
                    <Trans>Loading tokens…</Trans>
                  ) : tokensQuery.isError ? (
                    <Trans>Couldn't load tokens</Trans>
                  ) : tokens.length > 0 ? (
                    <Trans>Select a token</Trans>
                  ) : (
                    <Trans>No tokens available</Trans>
                  )}
                </p>
              )}
              <div>
                <label htmlFor="send-amount" className="mb-1.5 block text-sm font-medium">
                  <Trans>Amount</Trans>
                </label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <WalletAmountInput
                      id="send-amount"
                      label={t`Amount`}
                      value={amount}
                      autoFocus={step === "amount"}
                      aria-invalid={exceedsMax}
                      onValueChange={(value) => {
                        setMaxAmountRaw(null);
                        setAmount(sanitizeAmount(value));
                      }}
                    />
                  </div>
                  {selectedToken ? (
                    <span className="font-mono text-sm text-muted-foreground">
                      {selectedToken.symbol}
                    </span>
                  ) : null}
                </div>
                {unitValueLabel ? (
                  <p className="mt-1 font-mono text-sm text-muted-foreground" dir="ltr">
                    ({unitValueLabel})
                  </p>
                ) : null}
                {selectedToken ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => {
                      if (selectedToken.balance) {
                        setAmount(formatTokenAmountFixed(selectedToken.balance, tokenDecimals, 2));
                        setMaxAmountRaw(selectedToken.balance);
                        return;
                      }
                      setMaxAmountRaw(null);
                      setAmount(selectedToken.amount.replace(/,/g, ""));
                    }}
                  >
                    <Trans>Use max · {selectedToken.amount}</Trans>
                  </Button>
                ) : null}
                {exceedsMax ? (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    <Trans>Amount exceeds your balance</Trans>
                  </p>
                ) : null}
              </div>
            </div>
            <AddressBookSheet
              open={addressBookOpen}
              onOpenChange={setAddressBookOpen}
              onSelect={handleSelectRecipient}
              owner={owner}
            />
            <SendConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              amount={submittedVoucherAmount}
              symbol={selectedToken?.symbol ?? ""}
              unitValueLabel={unitValueLabel}
              recipient={recipientAddress}
              recipientLabel={recipient?.name ?? seededLabel}
              error={sendVoucher.error instanceof Error ? sendVoucher.error.message : null}
              isPending={sendVoucher.isPending}
              onConfirm={async () => {
                if (
                  !canSend ||
                  !address ||
                  !selectedToken ||
                  !parsedAmountRaw ||
                  !tokenAddress ||
                  !recipientAddress
                ) {
                  return;
                }
                const result = await sendVoucher
                  .mutateAsync({
                    senderAddress: address,
                    tokenAddress,
                    recipientAddress,
                    amountRaw: parsedAmountRaw,
                    includeAuthorization: delegationStatus === "not-delegated",
                  })
                  .catch(() => null);
                if (!result) return;
                const submittedUnitValue = relaySnapshotUnitValue(
                  result.valuationSnapshots,
                  tokenAddress,
                  exactVoucherAmount ?? amount,
                );
                void navigate({
                  to: "/wallet/send/receipt",
                  search: {
                    trackingId: result.trackingId,
                    token: tokenAddress,
                    recipient: recipientAddress,
                    recipientLabel: recipient?.name ?? seededLabel,
                    amount: submittedVoucherAmount,
                    symbol: selectedToken.symbol,
                    ...(submittedUnitValue
                      ? { uoaValue: submittedUnitValue.value, uoa: submittedUnitValue.unit }
                      : { uoaUnavailable: true }),
                    ...(returnPool ? { returnPool } : {}),
                  },
                });
              }}
            />
          </DeskInspector>
        }
      />
    </div>
  );
}

function RecentList({
  recipients,
  pending,
  failed,
  retrying,
  onRetry,
  onSelect,
}: {
  recipients: readonly Recipient[];
  pending: boolean;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  onSelect: (recipient: Recipient) => void;
}) {
  if (!pending && !failed && recipients.length === 0) return null;
  return (
    <section className="space-y-1">
      <p className="text-xs text-muted-foreground">
        <Trans>Recent recipients</Trans>
      </p>
      {pending ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Loading activity…</Trans>
        </p>
      ) : null}
      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            <Trans>Couldn't load activity.</Trans>
          </p>
          <Button type="button" variant="outline" pending={retrying} onClick={onRetry}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {recipients.length > 0 ? (
        <ul className="border border-border bg-card">
          {recipients.map((entry) => (
            <li key={entry.id} className="border-border border-b last:border-b-0">
              <RecentRecipientRow recipient={entry} onSelect={() => onSelect(entry)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SendConfirmDialog({
  open,
  onOpenChange,
  amount,
  symbol,
  unitValueLabel,
  recipient,
  recipientLabel,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  symbol: string;
  unitValueLabel: string | null;
  recipient: `0x${string}` | null;
  recipientLabel?: string;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="rounded-none border border-border bg-card shadow-none">
          <DialogTitle>
            <Trans>Confirm send</Trans>
          </DialogTitle>
          <div className="mt-4 border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2.5">
              <span className="text-xs text-muted-foreground">
                <Trans>Amount</Trans>
              </span>
              <span className="min-w-0 text-end font-mono text-xs font-semibold" dir="ltr">
                {amount} {symbol}
                {unitValueLabel ? ` (${unitValueLabel})` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">
                <Trans>Recipient</Trans>
              </span>
              {recipient ? (
                <RecipientIdentityLabel address={recipient} fallback={recipientLabel} showAddress />
              ) : null}
            </div>
          </div>
          {error ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" pending={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Sending…</Trans> : <Trans>Confirm and send</Trans>}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
