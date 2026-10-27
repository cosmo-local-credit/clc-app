import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import {
  chainHasPretiumRamp,
  offrampTokenSymbol,
  pretiumOfframpRecipient,
} from "@clc/core/features/wallet/pretium";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parsePhoneNumber } from "react-phone-number-input";
import { RiArrowRightSLine, RiErrorWarningLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress, isAddress } from "viem";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { EllipsizedAddress, TokenLogo, WalletAmountInput } from "#/components/wallet";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskRow, DeskRowList, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  accountWalletQueryKeys,
  useAccountTokensInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import {
  pretiumQueryKeys,
  useCreatePretiumLink,
  usePretiumLinkByAddress,
  usePretiumRates,
  usePretiumTransactionsByAddress,
  useTriggerPretiumOnramp,
} from "#/features/wallet/hooks/use-pretium";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";
import { cn } from "#/lib/utils";

const ONRAMP_ASSET = "USDT" as const;
const ONRAMP_ASSET_LABEL = "USD₮";
const COMPLETE_PRETIUM_STATUSES = new Set(["COMPLETE", "COMPLETED", "SUCCESS", "SETTLED"]);
const SAFARICOM_REGEX = /^(?:0|\+?254)(?:11[0-5]|7(?:[0129][0-9]|4[0-3568]|5[7-9]|6[89]))[0-9]{6}$/;

function isSafaricomNumber(phone: string): boolean {
  return SAFARICOM_REGEX.test(phone.replace(/\s+/g, ""));
}

function sanitizeKes(raw: string): string {
  return (raw.split(".")[0] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function TopUpDesk() {
  const { t } = useLingui();
  const { address } = useConnection();
  const profileQuery = useAuthProfile();
  const cashAddress = toChecksumAddress(address);
  const transactionsQuery = usePretiumTransactionsByAddress(cashAddress);
  const ratesQuery = usePretiumRates(true);
  const cashTransactions = useMemo(
    () =>
      [...(transactionsQuery.data?.onramps ?? []), ...(transactionsQuery.data?.offramps ?? [])]
        .filter((transaction) => transaction.reference)
        .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt)),
    [transactionsQuery.data],
  );
  const phone = profileQuery.data?.phone.trim() ?? "";
  const parsedPhone = phone ? parsePhoneNumber(phone, "KE") : undefined;
  const normalizedCashPhone = parsedPhone?.country === "KE" ? parsedPhone.number : phone;
  const hasPhone = phone.length > 0;
  const hasKenyanPhone = parsedPhone?.country === "KE";
  const disabledReason = !chainHasPretiumRamp(CHAIN_ID)
    ? t`Cash services aren't available on ${CHAIN_INFO.name}.`
    : !cashAddress
      ? t`Connect your wallet to use MPESA.`
      : profileQuery.isPending
        ? t`Loading your profile…`
        : profileQuery.isError
          ? t`We couldn't load your profile phone number.`
          : !hasPhone
            ? t`Add a phone number to your profile to use MPESA.`
            : !hasKenyanPhone
              ? t`MPESA cash services need a Kenyan phone number.`
              : null;

  const [panel, setPanel] = useState<Panel | null>({ kind: "add" });
  const selectedKey = panel?.kind === "tx" ? historyKey(panel.transaction) : null;

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas>
            <DeskTitle>
              <Trans>Cash</Trans>
            </DeskTitle>
            <div className="grid grid-cols-2 gap-4">
              <DeskSection title={<Trans>Add stables</Trans>}>
                <DeskRowList>
                  <RampRow
                    selected={panel?.kind === "add"}
                    onOpen={() => setPanel({ kind: "add" })}
                    subtitle={<Trans>Buy USD₮ with KES.</Trans>}
                  />
                </DeskRowList>
              </DeskSection>
              <DeskSection title={<Trans>Withdraw</Trans>}>
                <DeskRowList>
                  <RampRow
                    selected={panel?.kind === "withdraw"}
                    onOpen={() => setPanel({ kind: "withdraw" })}
                    subtitle="USDm · USDT · USDC"
                  />
                </DeskRowList>
              </DeskSection>
            </div>
            {disabledReason ? (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {disabledReason}
              </p>
            ) : null}
            <CashHistory
              transactions={cashTransactions}
              pending={!!cashAddress && transactionsQuery.isPending}
              error={!!cashAddress && transactionsQuery.isError}
              fetching={transactionsQuery.isFetching}
              onRetry={() => void transactionsQuery.refetch()}
              selectedKey={selectedKey}
              onSelect={(transaction) => setPanel({ kind: "tx", transaction })}
            />
          </DeskCanvas>
        }
        side={
          panel ? (
            <DeskInspector
              title={
                panel.kind === "add" ? (
                  <Trans>Add stables</Trans>
                ) : panel.kind === "withdraw" ? (
                  <Trans>Withdraw</Trans>
                ) : panel.transaction.kind === "onramp" ? (
                  <Trans>Onramp details</Trans>
                ) : (
                  <Trans>Offramp details</Trans>
                )
              }
              onClose={() => setPanel(null)}
            >
              {panel.kind === "add" ? (
                <AddStablesForm
                  address={cashAddress}
                  phone={normalizedCashPhone}
                  profilePending={profileQuery.isPending}
                  disabledReason={disabledReason}
                  entryDisabled={disabledReason !== null}
                  sell={ratesQuery.data?.sell}
                  ratesPending={ratesQuery.isPending}
                  ratesSuccess={ratesQuery.isSuccess}
                />
              ) : panel.kind === "withdraw" ? (
                <WithdrawForm
                  key={`${cashAddress ?? ""}:${normalizedCashPhone}`}
                  address={cashAddress}
                  phone={normalizedCashPhone}
                  disabledReason={disabledReason}
                  entryDisabled={disabledReason !== null}
                  buy={ratesQuery.data?.buy}
                  ratesSuccess={ratesQuery.isSuccess}
                />
              ) : (
                <CashDetail transaction={panel.transaction} />
              )}
            </DeskInspector>
          ) : null
        }
      />
    </div>
  );
}

type Panel =
  | { kind: "add" }
  | { kind: "withdraw" }
  | { kind: "tx"; transaction: PretiumCashTransaction };

function historyKey(transaction: PretiumCashTransaction): string {
  return `${transaction.kind}-${transaction.reference}`;
}

function RampRow({
  selected,
  onOpen,
  subtitle,
}: {
  selected: boolean;
  onOpen: () => void;
  subtitle: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onOpen}
      className="block w-full text-start hover:bg-muted/60"
    >
      <DeskRow
        selected={selected}
        lead={
          <img
            src="/pretium.png"
            alt=""
            className="size-9 shrink-0 border border-border bg-card object-contain"
            aria-hidden="true"
          />
        }
        title={<Trans>MPESA via Pretium</Trans>}
        subtitle={subtitle}
        trail={
          <RiArrowRightSLine
            className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
            aria-hidden="true"
          />
        }
      />
    </button>
  );
}

function AddStablesForm({
  address,
  phone,
  profilePending,
  disabledReason,
  entryDisabled,
  sell,
  ratesPending,
  ratesSuccess,
}: {
  address: `0x${string}` | undefined;
  phone: string;
  profilePending: boolean;
  disabledReason: string | null;
  entryDisabled: boolean;
  sell: string | undefined;
  ratesPending: boolean;
  ratesSuccess: boolean;
}) {
  const { i18n, t } = useLingui();
  const [amount, setAmount] = useState("");
  const triggerOnramp = useTriggerPretiumOnramp();
  const mutationError = triggerOnramp.error instanceof Error ? triggerOnramp.error.message : null;
  const showSafaricomWarning = !disabledReason && phone.length > 0 && !isSafaricomNumber(phone);
  const amountValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue >= 100 &&
    amountValue <= 250_000;
  const canContinue = !!address && !entryDisabled && hasValidAmount;
  const sellRate = Number(sell);
  const approxUsdt =
    ratesSuccess && Number.isFinite(sellRate) && sellRate > 0 && hasValidAmount
      ? amountValue / sellRate
      : null;

  const onContinue = async () => {
    if (!address || !canContinue) return;
    try {
      const parsed = parsePhoneNumber(phone, "KE");
      const shortcode = parsed ? `0${parsed.nationalNumber}` : phone;
      const result = await triggerOnramp.mutateAsync({
        address,
        phoneNumber: shortcode,
        asset: ONRAMP_ASSET,
        amount: amountValue,
      });
      toast.success(t`MPESA prompt sent`, {
        description: result.message || t`Complete the prompt on your phone.`,
      });
      setAmount("");
    } catch {
      toast.error(t`Couldn't start MPESA top up`);
    }
  };

  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor="topup-amount" className="text-sm font-medium">
          <Trans>Amount</Trans> <span className="font-mono text-xs text-muted-foreground">KES</span>
        </label>
        <WalletAmountInput
          id="topup-amount"
          label={t`Amount`}
          value={amount}
          placeholder="100"
          inputMode="decimal"
          disabled={entryDisabled}
          aria-invalid={amount !== "" && !hasValidAmount}
          onValueChange={(value) => setAmount(value.replace(/[^0-9.]/g, ""))}
        />
      </div>
      <DeskKV
        labelWidth="120px"
        rows={[
          [
            <Trans key="label">MPESA phone</Trans>,
            <span key="value" dir="ltr">
              {profilePending ? "…" : phone || "—"}
            </span>,
          ],
          [
            <Trans key="label">You'll receive</Trans>,
            <span key="value" dir="ltr">
              {ratesPending ? (
                <span className="text-muted-foreground">…</span>
              ) : approxUsdt !== null ? (
                `≈ ${approxUsdt.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
                  maximumFractionDigits: 2,
                })} ${ONRAMP_ASSET_LABEL}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>,
          ],
        ]}
      />
      {showSafaricomWarning ? (
        <p
          className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500"
          role="alert"
        >
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <Trans>Not a standard Safaricom number. Continue only if it's ported.</Trans>
        </p>
      ) : null}
      {disabledReason ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {disabledReason}
        </p>
      ) : null}
      {mutationError ? (
        <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {mutationError}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!canContinue}
        pending={triggerOnramp.isPending}
        onClick={() => void onContinue()}
      >
        {triggerOnramp.isPending ? <Trans>Starting…</Trans> : <Trans>Continue</Trans>}
      </Button>
    </>
  );
}

function WithdrawForm({
  address,
  phone,
  disabledReason,
  entryDisabled,
  buy,
  ratesSuccess,
}: {
  address: `0x${string}` | undefined;
  phone: string;
  disabledReason: string | null;
  entryDisabled: boolean;
  buy: string | undefined;
  ratesSuccess: boolean;
}) {
  const { i18n, t } = useLingui();
  const queryClient = useQueryClient();
  const offrampRecipient = pretiumOfframpRecipient(CHAIN_ID);
  const buyRate = Number(buy);
  const hasRate = ratesSuccess && Number.isFinite(buyRate) && buyRate > 0;
  const linkEnabled = !entryDisabled;
  const linkQuery = usePretiumLinkByAddress(address, linkEnabled);
  const createLink = useCreatePretiumLink();
  const correctlyLinked = linkQuery.data?.linked === true && linkQuery.data.phoneNumber === phone;
  const tokensQuery = useAccountTokensInfinite(address, { perPage: 100 });
  const eligible = useMemo(() => {
    const all = tokensQuery.data?.pages.flatMap((page) => page.tokens) ?? [];
    return all.flatMap((token) => {
      const symbol = offrampTokenSymbol(CHAIN_ID, token.tokenAddress);
      if (!symbol || BigInt(token.balance) <= 0n) return [];
      return [{ token, symbol }];
    });
  }, [tokensQuery.data]);
  const delegation = useCaliburDelegation(address);
  const sendTransfer = useSendVoucherTransfer();
  const sendError = sendTransfer.error instanceof Error ? sendTransfer.error.message : null;
  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const selected =
    eligible.find((item) => item.token.tokenAddress === selectedAddress) ?? eligible[0];
  const decimals = selected?.token.tokenDecimals ?? 2;
  const balanceRaw = selected?.token.balance ?? "0";
  const balanceUsd = selected ? Number(formatTokenAmountFixed(balanceRaw, decimals, 6)) : 0;
  const maxKes = hasRate ? Math.floor(balanceUsd * buyRate) : 0;
  const kesValue = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" &&
    Number.isFinite(kesValue) &&
    kesValue > 0 &&
    hasRate &&
    kesValue <= maxKes + 1e-9;
  const tokenToSend = hasValidAmount ? kesValue / buyRate : 0;
  const linkReady = createLink.isSuccess || (!linkQuery.isFetching && correctlyLinked);
  const linkPreparing =
    linkQuery.isPending || (linkQuery.isFetching && !createLink.isSuccess) || createLink.isPending;
  const linkFailed = linkQuery.isError || createLink.isError;
  const canWithdraw =
    linkReady && !!selected && hasValidAmount && delegation !== "checking" && !!address;

  useEffect(() => {
    if (!linkEnabled || !address || !phone) return;
    if (!linkQuery.isSuccess || linkQuery.isFetching || correctlyLinked) return;
    if (createLink.isIdle) createLink.mutate({ publicKey: address, phoneNumber: phone });
  }, [
    linkEnabled,
    address,
    phone,
    linkQuery.isSuccess,
    linkQuery.isFetching,
    correctlyLinked,
    createLink.isIdle,
    createLink,
  ]);

  const onWithdraw = async () => {
    if (!address || !selected || !hasValidAmount || !offrampRecipient) return;
    if (!isAddress(selected.token.tokenAddress)) return;
    const tokenAmount = (kesValue / buyRate).toFixed(Math.min(decimals, 6));
    let amountRaw = parseTokenAmount(tokenAmount, decimals);
    if (BigInt(amountRaw) > BigInt(balanceRaw)) amountRaw = balanceRaw;
    try {
      await sendTransfer.mutateAsync({
        senderAddress: address,
        tokenAddress: getAddress(selected.token.tokenAddress),
        recipientAddress: offrampRecipient,
        amountRaw,
        includeAuthorization: delegation === "not-delegated",
      });
      toast.success(t`Withdrawal submitted`, {
        description: t`Your MPESA payout will arrive shortly.`,
      });
      void queryClient.invalidateQueries({
        queryKey: pretiumQueryKeys.transactionsByAddress(address),
      });
      void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
      setAmount("");
    } catch {
      toast.error(t`Couldn't submit withdrawal`);
    }
  };

  return (
    <>
      {entryDisabled ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {disabledReason}
        </p>
      ) : linkFailed ? (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <Trans>Couldn't verify your MPESA link.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            pending={linkQuery.isFetching}
            onClick={() => {
              if (linkQuery.isError) void linkQuery.refetch();
              else createLink.reset();
            }}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : !linkReady || linkPreparing ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Preparing your withdrawal…</Trans>
        </p>
      ) : tokensQuery.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading balances…</Trans>
        </p>
      ) : eligible.length === 0 ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <Trans>No USDm, USDT, or USDC balance available to withdraw.</Trans>
        </p>
      ) : (
        <>
          <div className="border border-border bg-card">
            {eligible.map(({ token, symbol }, index, list) => {
              const active = token.tokenAddress === selected?.token.tokenAddress;
              const displayToken = {
                ...accountTokenToWalletToken(token),
                symbol,
                kind: "stable" as const,
              };
              return (
                <button
                  key={token.tokenAddress}
                  type="button"
                  onClick={() => {
                    setSelectedAddress(token.tokenAddress);
                    setAmount("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-start",
                    index < list.length - 1 && "border-border border-b",
                    active && "bg-primary/[0.07] shadow-[inset_2px_0_0_var(--color-primary)]",
                  )}
                >
                  <TokenLogo token={displayToken} size={20} />
                  <span className="text-sm font-semibold">{symbol}</span>
                  <span className="ms-auto font-heading font-semibold tracking-tight" dir="ltr">
                    {formatTokenAmount(token.balance, token.tokenDecimals)}
                  </span>
                </button>
              );
            })}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="withdraw-amount" className="text-sm font-medium">
                <Trans>Amount</Trans>{" "}
                <span className="font-mono text-xs text-muted-foreground">KES</span>
              </label>
              <Button
                type="button"
                variant="link"
                disabled={!hasRate || maxKes <= 0}
                onClick={() => setAmount(maxKes.toString())}
              >
                <Trans>Max</Trans>
              </Button>
            </div>
            <WalletAmountInput
              id="withdraw-amount"
              label={t`Amount`}
              value={amount}
              placeholder="0"
              inputMode="numeric"
              aria-invalid={amount !== "" && !hasValidAmount}
              onValueChange={(value) => setAmount(sanitizeKes(value))}
            />
          </div>
          <DeskKV
            labelWidth="120px"
            rows={[
              [
                <Trans key="label">You'll send</Trans>,
                <span key="value" dir="ltr">
                  {selected && hasValidAmount
                    ? `≈ ${tokenToSend.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
                        maximumFractionDigits: 4,
                      })} ${selected.symbol}`
                    : "—"}
                </span>,
              ],
            ]}
          />
        </>
      )}
      {sendError ? (
        <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
          <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {sendError}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!canWithdraw}
        pending={sendTransfer.isPending}
        onClick={() => void onWithdraw()}
      >
        {sendTransfer.isPending ? <Trans>Submitting…</Trans> : <Trans>Withdraw</Trans>}
      </Button>
    </>
  );
}

function CashHistory({
  transactions,
  pending,
  error,
  fetching,
  onRetry,
  selectedKey,
  onSelect,
}: {
  transactions: PretiumCashTransaction[];
  pending: boolean;
  error: boolean;
  fetching: boolean;
  onRetry: () => void;
  selectedKey: string | null;
  onSelect: (transaction: PretiumCashTransaction) => void;
}) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const columns = useMemo<DeskColumn<PretiumCashTransaction>[]>(
    () => [
      {
        id: "status",
        header: t`Status`,
        width: "minmax(0,1fr)",
        sortValue: (row) => row.status,
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: "kind",
        header: t`Type`,
        width: "minmax(0,1fr)",
        sortValue: (row) => row.kind,
        cell: (row) => (row.kind === "onramp" ? <Trans>Onramp</Trans> : <Trans>Offramp</Trans>),
      },
      {
        id: "date",
        header: t`Date`,
        width: "minmax(0,1fr)",
        sortValue: (row) => timestamp(row.createdAt),
        cell: (row) => (
          <time className="font-mono text-xs" dateTime={row.createdAt} dir="ltr">
            {formatCashDate(row.createdAt, locale)}
          </time>
        ),
      },
      {
        id: "amount",
        header: t`Amount`,
        align: "end",
        width: "10rem",
        sortValue: (row) => Number(row.amountKes) || 0,
        cell: (row) => (
          <span className="font-mono text-xs font-semibold" dir="ltr">
            {formatHistoryKes(row)} KES
          </span>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <DeskSection title={<Trans>Pretium history</Trans>}>
      {pending ? (
        <p className="flex items-center gap-2 border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading cash activity…</Trans>
        </p>
      ) : error ? (
        <div className="grid justify-items-start gap-2 border border-border bg-card p-4">
          <p role="alert" className="text-sm text-muted-foreground">
            <Trans>Couldn't load Pretium history.</Trans>
          </p>
          <Button type="button" variant="outline" pending={fetching} onClick={onRetry}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <DeskTable
          label={t`Pretium history`}
          rows={transactions}
          columns={columns}
          rowKey={historyKey}
          selectedKey={selectedKey}
          onSelect={onSelect}
          empty={<Trans>No cash activity yet.</Trans>}
        />
      )}
    </DeskSection>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={isCompletePretiumStatus(status) ? "primary" : "outline"} size="sm" caps>
      {status}
    </Badge>
  );
}

function CashDetail({ transaction }: { transaction: PretiumCashTransaction }) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const hasTxHash = transaction.txHash.trim() !== "";
  const explorerUrl = hasTxHash ? explorerTxUrl(CHAIN_INFO, transaction.txHash) : null;
  const incoming = transaction.kind === "onramp";
  const copyPretiumId = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy Pretium ID`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Pretium ID copied`))
      .catch(() => toast.error(t`Couldn't copy Pretium ID`));
  };

  return (
    <>
      <DeskKV
        labelWidth="130px"
        rows={[
          [
            <Trans key="label">Status</Trans>,
            <StatusBadge key="value" status={transaction.status} />,
          ],
          [
            <Trans key="label">Amount</Trans>,
            <span key="value" dir="ltr">
              {transaction.amountKes || "—"} KES
            </span>,
          ],
          incoming
            ? null
            : [
                <Trans key="label">Stable sent</Trans>,
                <span key="value" dir="ltr">
                  {transaction.amountUsd || "—"}
                </span>,
              ],
          incoming
            ? null
            : [
                <Trans key="label">MPESA phone</Trans>,
                <span key="value" dir="ltr">
                  {transaction.phoneNumber || "—"}
                </span>,
              ],
          !incoming && transaction.mpesaConfirmation
            ? [
                <Trans key="label">MPESA confirmation</Trans>,
                <span key="value" dir="ltr">
                  {transaction.mpesaConfirmation}
                </span>,
              ]
            : null,
          [
            <Trans key="label">Date</Trans>,
            <time key="value" dateTime={transaction.createdAt} dir="ltr">
              {formatCashDate(transaction.createdAt, locale)}
            </time>,
          ],
          [
            <Trans key="label">Pretium ID</Trans>,
            <button
              key="value"
              type="button"
              className="flex min-w-0 items-center gap-1.5"
              aria-label={t`Copy Pretium ID`}
              onClick={() => copyPretiumId(transaction.reference)}
            >
              <span className="truncate" dir="ltr">
                {shortenIdentifier(transaction.reference)}
              </span>
              <RiFileCopyLine
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>,
          ],
          [
            <Trans key="label">Transaction</Trans>,
            hasTxHash ? (
              <EllipsizedAddress key="value" address={transaction.txHash} />
            ) : (
              <span key="value" className="text-muted-foreground">
                <Trans>Pending</Trans>
              </span>
            ),
          ],
        ]}
      />
      {explorerUrl ? (
        <Button asChild variant="outline">
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            <Trans>View on block explorer</Trans>
          </a>
        </Button>
      ) : null}
    </>
  );
}

function toChecksumAddress(address: `0x${string}` | undefined): `0x${string}` | undefined {
  if (!address) return undefined;
  try {
    return getAddress(address);
  } catch {
    return undefined;
  }
}

function isCompletePretiumStatus(status: string): boolean {
  return COMPLETE_PRETIUM_STATUSES.has(status.trim().toUpperCase());
}

function shortenIdentifier(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function timestamp(date: string): number {
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
}

function formatHistoryKes(transaction: PretiumCashTransaction): string {
  if (!transaction.amountKes) return "—";
  return transaction.amountKes.split(".")[0] || transaction.amountKes;
}

function formatCashDate(date: string, locale: string): string {
  if (!date) return "—";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
