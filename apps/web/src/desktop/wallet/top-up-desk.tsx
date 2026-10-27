import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, type ReactNode } from "react";
import { RiArrowRightSLine, RiErrorWarningLine, RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { EllipsizedAddress, TokenLogo, WalletAmountInput } from "#/components/wallet";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskRow, DeskRowList, DeskSection, DeskTitle } from "#/desktop/ui/page";
import {
  useAddStables,
  useCashAccess,
  usePretiumWithdraw,
} from "#/features/wallet/hooks/use-pretium-cash";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import {
  cashTimestamp,
  formatHistoryKes,
  isCompletePretiumStatus,
  ONRAMP_ASSET_LABEL,
  shortenIdentifier,
} from "#/features/wallet/logic/pretium-cash";
import { CHAIN_INFO } from "#/lib/chain";

type CashPanel = "add" | "withdraw";

function historyKey(transaction: PretiumCashTransaction): string {
  return `${transaction.kind}-${transaction.reference}`;
}

/** The two MPESA ramps and the Pretium history; forms and receipts open in the inspector. */
export function TopUpDesk() {
  const access = useCashAccess();
  const { cashAddress, cashTransactions, transactionsQuery, disabledReason } = access;
  const search = useSearch({ from: "/wallet/top-up" });
  const navigate = useNavigate({ from: "/wallet/top-up" });
  const panel: CashPanel | null = search.tx ? null : (search.sheet ?? null);
  const selectedTx = search.tx
    ? (cashTransactions.find((transaction) => historyKey(transaction) === search.tx) ?? null)
    : null;
  const addStables = useAddStables({ access, ratesEnabled: panel === "add" });
  // Opening the first inspector pushes history; switching replaces it; closing
  // pops what this page pushed, or drops the params on a deep link.
  const pushed = useRef(false);
  const inspectorOpen = panel !== null || search.tx !== undefined;

  function open(next: { sheet?: CashPanel; tx?: string }) {
    if (next.sheet === search.sheet && next.tx === search.tx) return;
    const replace = inspectorOpen;
    if (!replace) pushed.current = true;
    void navigate({ search: next, replace });
  }

  function close() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    void navigate({ search: {}, replace: true });
  }

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
                    selected={panel === "add"}
                    onOpen={() => open({ sheet: "add" })}
                    subtitle={<Trans>Buy USD₮ with KES.</Trans>}
                  />
                </DeskRowList>
              </DeskSection>
              <DeskSection title={<Trans>Withdraw</Trans>}>
                <DeskRowList>
                  <RampRow
                    selected={panel === "withdraw"}
                    onOpen={() => open({ sheet: "withdraw" })}
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
              selectedKey={search.tx ?? null}
              onSelect={(transaction) => open({ tx: historyKey(transaction) })}
            />
          </DeskCanvas>
        }
        side={
          inspectorOpen ? (
            <DeskInspector
              title={
                panel === "add" ? (
                  <Trans>Add stables</Trans>
                ) : panel === "withdraw" ? (
                  <Trans>Withdraw</Trans>
                ) : selectedTx?.kind === "offramp" ? (
                  <Trans>Offramp details</Trans>
                ) : (
                  <Trans>Onramp details</Trans>
                )
              }
              onClose={close}
            >
              {panel === "add" ? (
                <AddStablesForm form={addStables} access={access} />
              ) : panel === "withdraw" ? (
                <WithdrawForm
                  key={`${cashAddress ?? ""}:${access.phone}`}
                  address={cashAddress}
                  phone={access.phone}
                  disabledReason={disabledReason}
                  entryDisabled={access.entryDisabled}
                />
              ) : selectedTx ? (
                <CashDetail transaction={selectedTx} />
              ) : transactionsQuery.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  <Trans>Loading cash activity…</Trans>
                </p>
              ) : (
                <p role="alert" className="text-sm text-muted-foreground">
                  <Trans>Couldn't load Pretium history.</Trans>
                </p>
              )}
            </DeskInspector>
          ) : null
        }
      />
    </div>
  );
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

function Notice({ tone, children }: { tone: "muted" | "warning" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "muted" ? undefined : "alert"}
      className={
        tone === "error"
          ? "flex items-start gap-2 text-xs text-destructive"
          : tone === "warning"
            ? "flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500"
            : "flex items-start gap-2 text-xs text-muted-foreground"
      }
    >
      <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

function AddStablesForm({
  form,
  access,
}: {
  form: ReturnType<typeof useAddStables>;
  access: ReturnType<typeof useCashAccess>;
}) {
  const { i18n, t } = useLingui();
  const { phone, profilePending, disabledReason, entryDisabled } = access;
  const submit = async () => {
    if (await form.submit()) form.setAmount("");
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={`${t`Amount`} (KES)`} htmlFor="topup-amount">
        <WalletAmountInput
          id="topup-amount"
          label={t`Amount`}
          value={form.amount}
          placeholder="100"
          inputMode="decimal"
          disabled={entryDisabled}
          aria-invalid={form.amount !== "" && !form.hasValidAmount}
          onValueChange={form.setAmount}
        />
      </Field>
      <Field label={t`MPESA phone`} htmlFor="topup-phone">
        <Input
          id="topup-phone"
          readOnly
          dir="ltr"
          className="font-mono"
          value={profilePending ? "…" : phone}
          placeholder="—"
        />
      </Field>
      <DeskKV
        labelWidth="120px"
        rows={[
          [
            <Trans key="label">You'll receive</Trans>,
            <span key="value" dir="ltr">
              {form.ratesPending ? (
                <span className="text-muted-foreground">…</span>
              ) : form.approxUsdt !== null ? (
                `≈ ${form.approxUsdt.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
                  maximumFractionDigits: 2,
                })} ${ONRAMP_ASSET_LABEL}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>,
          ],
        ]}
      />
      {form.showSafaricomWarning ? (
        <Notice tone="warning">
          <Trans>Not a standard Safaricom number. Continue only if it's ported.</Trans>
        </Notice>
      ) : null}
      {disabledReason ? <Notice tone="muted">{disabledReason}</Notice> : null}
      {form.mutationError ? <Notice tone="error">{form.mutationError}</Notice> : null}
      <Button type="submit" disabled={!form.canContinue} pending={form.pending}>
        {form.pending ? <Trans>Starting…</Trans> : <Trans>Continue</Trans>}
      </Button>
    </form>
  );
}

function WithdrawForm({
  address,
  phone,
  disabledReason,
  entryDisabled,
}: {
  address: `0x${string}` | undefined;
  phone: string;
  disabledReason: string | null;
  entryDisabled: boolean;
}) {
  const { i18n, t } = useLingui();
  const form = usePretiumWithdraw({ open: true, address, phone, entryDisabled });
  const { eligible, selected } = form;
  const submit = async () => {
    if (await form.submit()) form.setAmount("");
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {entryDisabled ? (
        <Notice tone="muted">{disabledReason}</Notice>
      ) : form.linkFailed ? (
        <div className="grid justify-items-start gap-2">
          <Notice tone="error">
            <Trans>Couldn't verify your MPESA link.</Trans>
          </Notice>
          <Button
            type="button"
            variant="outline"
            pending={form.linkRetrying}
            onClick={form.retryLink}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : !form.linkReady || form.linkPreparing ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Preparing your withdrawal…</Trans>
        </p>
      ) : form.tokensPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading balances…</Trans>
        </p>
      ) : eligible.length === 0 ? (
        <Notice tone="muted">
          <Trans>No USDm, USDT, or USDC balance available to withdraw.</Trans>
        </Notice>
      ) : (
        <>
          <Field label={t`Token`} htmlFor="withdraw-token">
            <SelectRoot
              value={selected?.token.tokenAddress ?? null}
              onValueChange={(value) => {
                if (typeof value === "string") form.selectToken(value);
              }}
            >
              <SelectTrigger id="withdraw-token" className="w-full border-foreground/25">
                {selected ? <StableOption token={selected.token} symbol={selected.symbol} /> : null}
              </SelectTrigger>
              <SelectContent>
                {eligible.map(({ token, symbol }) => (
                  <SelectItem key={token.tokenAddress} value={token.tokenAddress}>
                    <StableOption token={token} symbol={symbol} />
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Field>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="withdraw-amount" className="text-sm font-medium">
                {`${t`Amount`} (KES)`}
              </label>
              <Button type="button" variant="link" disabled={!form.canSetMax} onClick={form.setMax}>
                <Trans>Max</Trans>
              </Button>
            </div>
            <WalletAmountInput
              id="withdraw-amount"
              label={t`Amount`}
              value={form.amount}
              placeholder="0"
              inputMode="numeric"
              aria-invalid={form.amount !== "" && !form.hasValidAmount}
              onValueChange={form.setAmount}
            />
          </div>
          <DeskKV
            labelWidth="120px"
            rows={[
              [
                <Trans key="label">MPESA phone</Trans>,
                <span key="value" dir="ltr">
                  {phone || "—"}
                </span>,
              ],
              [
                <Trans key="label">You'll send</Trans>,
                <span key="value" dir="ltr">
                  {selected && form.hasValidAmount
                    ? `≈ ${form.tokenToSend.toLocaleString(i18n.locales?.[0] ?? i18n.locale, {
                        maximumFractionDigits: 4,
                      })} ${selected.symbol}`
                    : "—"}
                </span>,
              ],
            ]}
          />
        </>
      )}
      {form.sendError ? <Notice tone="error">{form.sendError}</Notice> : null}
      <Button type="submit" disabled={!form.canWithdraw} pending={form.pending}>
        {form.pending ? <Trans>Submitting…</Trans> : <Trans>Withdraw</Trans>}
      </Button>
    </form>
  );
}

function StableOption({
  token,
  symbol,
}: {
  token: ReturnType<typeof usePretiumWithdraw>["eligible"][number]["token"];
  symbol: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <TokenLogo
        token={{ ...accountTokenToWalletToken(token), symbol, kind: "stable" as const }}
        size={20}
      />
      <span className="min-w-0 truncate text-sm font-semibold">{symbol}</span>
      <span className="ms-auto ps-3 font-heading font-semibold tracking-tight" dir="ltr">
        {formatTokenAmount(token.balance, token.tokenDecimals)}
      </span>
    </span>
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
        sortValue: (row) => cashTimestamp(row.createdAt),
        cell: (row) => (
          <time className="font-mono text-xs" dateTime={row.createdAt} dir="ltr">
            {formatCashDateTime(row.createdAt, locale)}
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
              {formatCashDateTime(transaction.createdAt, locale)}
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

/** Day and time, as the mock's history rows read: 25 Oct 18:12. */
function formatCashDateTime(date: string, locale: string): string {
  if (!date) return "—";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
