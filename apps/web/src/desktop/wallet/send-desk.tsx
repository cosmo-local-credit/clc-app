import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCanGoBack, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { RiGroupLine } from "react-icons/ri";
import { getAddress, isAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { TokenLogo, WalletAmountInput, type WalletToken } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";
import type { Recipient } from "#/components/wallet/wallet-data";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { DeskChip } from "#/desktop/ui/segment";
import { SendRecipientField } from "#/desktop/wallet/send-recipient-field";
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
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { GUEST_STORAGE_OWNER, type StorageOwner } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";

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
  const router = useRouter();
  const canGoBack = useCanGoBack();
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
  const locale = i18n.locales?.[0] ?? i18n.locale;
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
        header: t`Voucher`,
        sortValue: (row) => row.name,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <TokenLogo token={row} size={20} />
            <span className="truncate">{row.name}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "10rem",
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

  function selectToken(id: string) {
    setMaxAmountRaw(null);
    setSelectedId(id);
  }

  function close() {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/", search: { tab: "wallet" } });
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
          <DeskCanvas>
            <DeskTitle>
              <Trans>Wallet</Trans>
            </DeskTitle>
            <DeskTable
              label={t`Holdings`}
              rows={tokens}
              columns={columns}
              rowKey={(row) => row.id}
              selectedKey={selectedToken?.id}
              onSelect={(row) => selectToken(row.id)}
              empty={
                !address ? (
                  <Trans>No wallet address available.</Trans>
                ) : loadingTokens ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    <Trans>Loading tokens…</Trans>
                  </span>
                ) : tokensQuery.isError ? (
                  <Trans>Couldn't load tokens</Trans>
                ) : (
                  <Trans>No tokens available</Trans>
                )
              }
            />
          </DeskCanvas>
        }
        side={
          <DeskInspector title={<Trans>Send</Trans>} onClose={close}>
            <div className="grid min-w-0 gap-2">
              <label htmlFor="send-recipient" className="text-sm font-medium">
                <Trans>To</Trans>
              </label>
              <SendRecipientField
                id="send-recipient"
                value={query}
                onValueChange={(value) => {
                  setSelectedRecipient(null);
                  setQuery(value);
                }}
                onRecipientChange={setResolvedRecipient}
                ariaLabel={t`Recipient username, pool name, phone or address`}
              />
              {wallet !== undefined ? (
                <RecentChips
                  recipients={showRecent ? recent : []}
                  pending={showRecent && transfersQuery.isPending}
                  failed={showRecent && transfersQuery.isError}
                  retrying={transfersQuery.isFetching}
                  onRetry={() => void transfersQuery.refetch()}
                  onSelect={handleSelectRecipient}
                  addressBook={
                    <AddressBookPopover owner={owner} onSelect={handleSelectRecipient} />
                  }
                />
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2">
              <label htmlFor="send-amount" className="text-sm font-medium">
                <Trans>Amount</Trans>
              </label>
              {/* The 64px amount box: WalletAmountInput keeps its surface, border
                  and amount type; the token picker sits inside its end edge. */}
              <div className="relative min-w-0">
                <WalletAmountInput
                  id="send-amount"
                  label={t`Amount`}
                  value={amount}
                  autoFocus={step === "amount"}
                  aria-invalid={exceedsMax}
                  style={{
                    height: "4rem",
                    paddingInlineEnd: "9rem",
                    paddingInlineStart: "0.875rem",
                  }}
                  onValueChange={(value) => {
                    setMaxAmountRaw(null);
                    setAmount(sanitizeAmount(value));
                  }}
                />
                <div className="absolute inset-y-0 end-3 flex items-center">
                  <TokenPicker
                    tokens={tokens}
                    selected={selectedToken}
                    loading={loadingTokens}
                    onSelect={selectToken}
                  />
                </div>
              </div>
              {selectedToken ? (
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground">
                    <Trans>
                      Balance <span className="font-mono">{selectedToken.amount}</span>
                    </Trans>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
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
                    <Trans>Max</Trans>
                  </Button>
                </div>
              ) : (
                <p
                  className={cn(
                    "text-xs",
                    tokensQuery.isError ? "text-destructive" : "text-muted-foreground",
                  )}
                  role={tokensQuery.isError ? "alert" : undefined}
                >
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
              {tokensQuery.isError && !selectedToken ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  pending={tokensQuery.isFetching}
                  onClick={() => void tokensQuery.refetch()}
                >
                  <Trans>Try again</Trans>
                </Button>
              ) : null}
              {exceedsMax ? (
                <p className="text-xs text-destructive" role="alert">
                  <Trans>Amount exceeds your balance</Trans>
                </p>
              ) : null}
            </div>
            <DeskKV
              rows={[
                [
                  t`Recipient`,
                  recipient ? (
                    <span key="recipient" className="grid min-w-0" title={recipient.address}>
                      {recipient.name ? (
                        <span className="truncate font-sans" dir="auto">
                          {recipient.name}
                        </span>
                      ) : null}
                      <span className="truncate" dir="ltr">
                        {formatVoucherAddress(recipient.address)}
                      </span>
                    </span>
                  ) : (
                    <Dash key="recipient" />
                  ),
                ],
                [
                  t`Amount`,
                  exactVoucherAmount !== null && selectedToken ? (
                    <span key="amount" dir="ltr">
                      {exactVoucherAmount} {selectedToken.symbol}
                    </span>
                  ) : (
                    <Dash key="amount" />
                  ),
                ],
                [
                  t`Value`,
                  unitValueLabel ? (
                    <span key="value" dir="ltr">
                      {unitValueLabel}
                    </span>
                  ) : (
                    <Dash key="value" />
                  ),
                ],
                // The relayer submits the transfer and pays its gas: the signed
                // batch is the ERC-20 transfer alone, with no fee call, so the
                // sender pays nothing on top of the amount.
                [
                  t`Network fee`,
                  <span key="fee" dir="ltr">
                    {formatTokenAmountFixed("0", 2, 2, locale)}
                  </span>,
                ],
              ]}
            />
            <Button
              type="button"
              className="w-full"
              disabled={!canSend}
              pending={upsertRecipient.isPending}
              onClick={() => void openReview()}
            >
              <Trans>Review</Trans>
            </Button>
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

function Dash() {
  return (
    <span className="text-muted-foreground" dir="ltr">
      —
    </span>
  );
}

function TokenPicker({
  tokens,
  selected,
  loading,
  onSelect,
}: {
  tokens: readonly WalletToken[];
  selected: WalletToken | undefined;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useLingui();
  return (
    <SelectRoot
      value={selected?.id ?? null}
      disabled={loading || tokens.length === 0}
      onValueChange={(value) => {
        if (typeof value === "string") onSelect(value);
      }}
    >
      <SelectTrigger
        aria-label={t`Voucher`}
        className="max-w-36 shrink-0 gap-2 border-foreground/25 px-2.5 text-sm font-semibold"
      >
        {selected ? (
          <>
            <TokenLogo token={selected} size={20} />
            <span className="min-w-0 truncate" dir="ltr">
              {selected.symbol}
            </span>
          </>
        ) : loading ? (
          <Spinner />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {tokens.map((token) => (
          <SelectItem key={token.id} value={token.id}>
            <span className="flex min-w-0 items-center gap-2">
              <TokenLogo token={token} size={20} />
              <span className="min-w-0 truncate font-semibold" dir="ltr">
                {token.symbol}
              </span>
              <span className="ps-3 font-heading font-semibold tracking-tight" dir="ltr">
                {token.amount}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

function initials(label: string) {
  if (label.startsWith("0x")) return "0x";
  return (
    label
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function RecentChip({ recipient, onSelect }: { recipient: Recipient; onSelect: () => void }) {
  const identity = useReverseRecipientResolution(recipient.address ?? null);
  const named = !recipient.label.startsWith("0x");
  const label = identity.data
    ? identity.data.kind === "user"
      ? identity.data.alias
      : identity.data.name
    : named
      ? recipient.label
      : recipient.address
        ? formatVoucherAddress(recipient.address as `0x${string}`)
        : recipient.label;
  return (
    <DeskChip>
      <button type="button" className="max-w-full min-w-0" onClick={onSelect}>
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary font-heading text-2xs font-bold">
          {initials(label).slice(0, 2)}
        </span>
        <span
          className={cn("min-w-0 truncate", label.startsWith("0x") && "font-mono")}
          dir={label.startsWith("0x") ? "ltr" : "auto"}
        >
          {label}
        </span>
      </button>
    </DeskChip>
  );
}

function RecentChips({
  recipients,
  pending,
  failed,
  retrying,
  onRetry,
  onSelect,
  addressBook,
}: {
  recipients: readonly Recipient[];
  pending: boolean;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  onSelect: (recipient: Recipient) => void;
  addressBook: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <div className="grid min-w-0 gap-2">
      <ul aria-label={t`Recent recipients`} className="flex min-w-0 flex-wrap gap-2">
        {recipients.slice(0, 6).map((entry) => (
          <li key={entry.id} className="min-w-0 max-w-full">
            <RecentChip recipient={entry} onSelect={() => onSelect(entry)} />
          </li>
        ))}
        <li className="min-w-0">{addressBook}</li>
      </ul>
      {pending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          <Trans>Loading activity…</Trans>
        </p>
      ) : null}
      {failed ? (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p role="alert" className="text-xs text-destructive">
            <Trans>Couldn't load activity.</Trans>
          </p>
          <Button type="button" variant="outline" pending={retrying} onClick={onRetry}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The saved recipients, in a popover anchored to the chip that opens it. */
function AddressBookPopover({
  owner,
  onSelect,
}: {
  owner: StorageOwner | null;
  onSelect: (recipient: Recipient) => void;
}) {
  const [open, setOpen] = useState(false);
  const recipientsQuery = useAddressBookRecipients(owner);
  const recipients = recipientsQuery.data ?? [];
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <DeskChip on={open}>
        <PopoverTrigger>
          <RiGroupLine aria-hidden="true" />
          <Trans>Address book</Trans>
        </PopoverTrigger>
      </DeskChip>
      <PopoverContent align="start" className="grid w-80 p-0">
        <PopoverTitle className="border-b border-border px-4 py-3 font-heading text-sm font-semibold">
          <Trans>Address book</Trans>
        </PopoverTitle>
        {recipientsQuery.isPending ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
            <Spinner />
            <Trans>Loading address book…</Trans>
          </p>
        ) : recipients.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            <Trans>No saved recipients yet.</Trans>
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="border-t border-border first:border-t-0">
                <AddressBookEntry
                  recipient={recipient}
                  onSelect={() => {
                    onSelect(recipient);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

function AddressBookEntry({ recipient, onSelect }: { recipient: Recipient; onSelect: () => void }) {
  const identity = useReverseRecipientResolution(recipient.address ?? null);
  const named = !recipient.label.startsWith("0x");
  const title = identity.data
    ? identity.data.kind === "user"
      ? identity.data.alias
      : identity.data.name
    : named
      ? recipient.label
      : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="grid w-full min-w-0 gap-0.5 px-4 py-2.5 text-start hover:bg-muted"
    >
      {title ? (
        <span className="truncate text-sm font-semibold" dir="auto">
          {title}
        </span>
      ) : null}
      {recipient.address ? (
        <span className="truncate font-mono text-xs text-muted-foreground" dir="ltr">
          {formatVoucherAddress(recipient.address as `0x${string}`)}
        </span>
      ) : null}
    </button>
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
