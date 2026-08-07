import {
  buildSendSharePermission,
  formatTokenAmountFixed,
  hasSendSharePermission,
  parseTokenAmount,
  SEND_SHARE_PERMISSION,
} from "@clc/core/features/wallet/logic";
import { Accordion } from "@base-ui/react/accordion";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { EllipsizedAddress, SignHint, TokenLogo } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useSendShareEligibility } from "#/features/wallet/hooks/use-send-share";
import { useSendVoucherTransfer } from "#/features/wallet/hooks/use-send-voucher-transfer";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { cn } from "#/lib/utils";
import { TokenPickerSheet } from "./token-picker-sheet";

/** Keep only digits and a single decimal point, capped at 2 fraction digits. */
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

export function SendAmountPage({
  token,
  recipient,
  recipientLabel,
}: {
  token?: string;
  recipient?: string;
  recipientLabel?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);
  const tokensQuery = useAccountTokensInfinite(address);
  const profileQuery = useAuthProfile();
  const sendVoucher = useSendVoucherTransfer();
  const tokens =
    tokensQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];

  // Preselect the token passed from the token detail page; fall back to the
  // first token once balances load. `selectedId` mirrors the fetched token id
  // (the lowercased contract address).
  const [selectedId, setSelectedId] = useState<string | undefined>(token?.toLowerCase());
  const selectedToken = tokens.find((item) => item.id === selectedId) ?? tokens[0];
  // Preserve the current token selection when editing the recipient.
  const tokenParam = selectedToken?.contractAddress ?? selectedToken?.id ?? token;

  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [maxAmountRaw, setMaxAmountRaw] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [shareEmail, setShareEmail] = useState(false);
  const [sharePhone, setSharePhone] = useState(false);
  const [shareLocation, setShareLocation] = useState(false);

  const tokenDecimals = selectedToken?.tokenDecimals ?? 2;
  const parsedAmountRaw = useMemo(() => {
    if (!selectedToken || amount.trim() === "") return null;
    try {
      return maxAmountRaw ?? parseTokenAmount(amount, tokenDecimals);
    } catch {
      return null;
    }
  }, [amount, maxAmountRaw, selectedToken, tokenDecimals]);
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
  const recipientAddress =
    recipient && recipient.startsWith("0x") ? (recipient as `0x${string}`) : null;
  const shareEligibility = useSendShareEligibility(recipientAddress);
  const shareAvailable = shareEligibility.data === true;
  const profileEmail = profileQuery.data?.email.endsWith("@clc.local")
    ? ""
    : (profileQuery.data?.email ?? "");
  const hasEmail = profileEmail !== "";
  const hasPhone = (profileQuery.data?.phone ?? "") !== "";
  const hasLocation = profileQuery.data?.location != null;
  const sharePermission = buildSendSharePermission({
    email: shareEmail,
    phone: sharePhone,
    location: shareLocation,
  });
  const trimmedNote = note.trim();
  const sharePayload =
    shareAvailable && (sharePermission !== 0 || trimmedNote !== "")
      ? {
          permission: sharePermission,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        }
      : undefined;
  const tokenAddress = selectedToken?.contractAddress
    ? (selectedToken.contractAddress as `0x${string}`)
    : null;
  const canSend =
    !!address &&
    !!recipientAddress &&
    !!tokenAddress &&
    !!selectedToken &&
    delegationStatus !== "checking" &&
    isValidAmount &&
    !exceedsMax;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Send`} to="/wallet/send" search={{ token: tokenParam }} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Amount</Trans>
      </h1>

      {recipientAddress ? (
        <div className="mb-2.5 flex h-12 items-center gap-2.5 border border-border bg-card px-3">
          <span className="shrink-0 text-muted-foreground text-xs">
            <Trans>To</Trans>
          </span>
          <div className="min-w-0 flex-1">
            {recipientLabel ? (
              <p className="truncate font-medium text-xs">{recipientLabel}</p>
            ) : (
              <EllipsizedAddress address={recipientAddress} />
            )}
          </div>
          <button
            type="button"
            className="font-semibold text-primary text-xs hover:underline"
            onClick={() => {
              void navigate({ to: "/wallet/send", search: { token: tokenParam } });
            }}
          >
            <Trans>Edit</Trans>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!selectedToken}
        className="mb-2.5 flex h-11 w-full items-center gap-2.5 border border-border bg-card px-3 text-left disabled:opacity-60"
      >
        {selectedToken ? (
          <>
            <TokenLogo token={selectedToken} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{selectedToken.symbol}</p>
              <p className="text-muted-foreground text-xs">
                <Trans>Balance {selectedToken.amount}</Trans>
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm">
              {tokensQuery.isError ? (
                <Trans>Couldn't load tokens</Trans>
              ) : tokensQuery.isSuccess ? (
                <Trans>No tokens available</Trans>
              ) : (
                <Trans>Loading tokens…</Trans>
              )}
            </p>
          </div>
        )}
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <div className="mb-2.5 flex flex-col items-center border border-border bg-card px-4 py-5">
        <div className="flex items-baseline justify-center gap-1.5">
          <div className="relative flex items-baseline">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={amount}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onChange={(event) => {
                setMaxAmountRaw(null);
                setAmount(sanitizeAmount(event.target.value));
              }}
              // field-sizing sizes the input to its text exactly, so the
              // number + symbol pair centers true. size is the pre-support fallback.
              size={Math.max(amount.length, 1)}
              aria-label={t`Amount`}
              aria-invalid={exceedsMax}
              className={cn(
                "min-w-0 bg-transparent text-center font-heading text-[2.5rem] font-semibold leading-none tracking-tight caret-primary outline-none [field-sizing:content]",
                exceedsMax && "text-destructive",
              )}
            />
            {!amount && !amountFocused ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-1/2 h-9 w-px -translate-x-1/2 -translate-y-1/2 animate-pulse bg-primary"
              />
            ) : null}
          </div>
          <span className="text-[1.25rem] text-muted-foreground">{selectedToken?.symbol}</span>
        </div>
        {selectedToken ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 h-8"
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
          <p className="mt-2 text-destructive text-xs">
            <Trans>Amount exceeds your balance</Trans>
          </p>
        ) : null}
      </div>

      <Accordion.Root className="mb-2.5">
        <Accordion.Item value="private-attachment" className="border border-border bg-card">
          <Accordion.Header render={<h2 />}>
            <Accordion.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <span className="min-w-0">
                <span className="block font-semibold text-sm">
                  <Trans>Message and contact sharing</Trans>
                </span>
                <span className="block text-muted-foreground text-xs">
                  <Trans>
                    Selected details stay in Cosmo and are not written to the blockchain.
                  </Trans>
                </span>
              </span>
              <RiArrowDownSLine
                className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden="true"
              />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Panel className="space-y-3 border-t border-border p-3">
            {shareEligibility.isPending ? (
              <p className="text-muted-foreground text-xs">
                <Trans>Checking whether this recipient can receive private details…</Trans>
              </p>
            ) : null}
            {shareEligibility.isSuccess && !shareAvailable ? (
              <p className="text-muted-foreground text-xs">
                <Trans>
                  This wallet is not a registered Cosmo recipient. You can still send without an
                  attachment.
                </Trans>
              </p>
            ) : null}
            {shareEligibility.isError ? (
              <p className="text-muted-foreground text-xs">
                <Trans>
                  Private sharing is unavailable right now. You can still send normally.
                </Trans>
              </p>
            ) : null}

            <div className="space-y-1">
              <label htmlFor="send-note" className="font-medium text-xs">
                <Trans>Message</Trans>
              </label>
              <textarea
                id="send-note"
                value={note}
                maxLength={1000}
                disabled={!shareAvailable}
                onChange={(event) => setNote(Array.from(event.target.value).slice(0, 500).join(""))}
                placeholder={t`Add an optional note`}
                className="min-h-20 w-full resize-y border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-right text-muted-foreground text-[0.6875rem]">
                {Array.from(note).length}/500
              </p>
            </div>

            <div className="space-y-2">
              <ShareCheckbox
                label={t`Location pin`}
                description={
                  hasLocation
                    ? t`Share your saved pin for this send.`
                    : t`Add a pin in Edit profile.`
                }
                checked={shareLocation}
                disabled={!shareAvailable || !hasLocation}
                onChange={setShareLocation}
              />
              <ShareCheckbox
                label={t`Email`}
                description={
                  hasEmail ? t`Share your email for this send.` : t`Add an email in Edit profile.`
                }
                checked={shareEmail}
                disabled={!shareAvailable || !hasEmail}
                onChange={setShareEmail}
              />
              <ShareCheckbox
                label={t`Phone`}
                description={
                  hasPhone ? t`Share your phone for this send.` : t`Add a phone in Edit profile.`
                }
                checked={sharePhone}
                disabled={!shareAvailable || !hasPhone}
                onChange={setSharePhone}
              />
            </div>

            {profileQuery.isSuccess && (!hasEmail || !hasPhone || !hasLocation) ? (
              <button
                type="button"
                className="font-semibold text-primary text-xs hover:underline"
                onClick={() => void navigate({ to: "/settings/profile" })}
              >
                <Trans>Edit profile</Trans>
              </button>
            ) : null}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>

      <div className="flex-1" />

      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={!canSend || sendVoucher.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {t`Send`}
      </Button>

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={tokens}
        selectedId={selectedToken?.id}
        onSelect={(next) => {
          setMaxAmountRaw(null);
          setSelectedId(next.id);
        }}
      />

      <SendConfirmationSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        amount={amount}
        symbol={selectedToken?.symbol ?? ""}
        recipient={recipientAddress}
        note={sharePayload?.note ?? ""}
        sharePermission={sharePayload?.permission ?? 0}
        error={sendVoucher.error instanceof Error ? sendVoucher.error.message : null}
        isPending={sendVoucher.isPending}
        onConfirm={async () => {
          if (!canSend || !selectedToken || !parsedAmountRaw || !tokenAddress || !recipientAddress)
            return;
          const result = await sendVoucher
            .mutateAsync({
              senderAddress: address as `0x${string}`,
              tokenAddress,
              recipientAddress,
              amountRaw: parsedAmountRaw,
              includeAuthorization: delegationStatus === "not-delegated",
              ...(sharePayload ? { share: sharePayload } : {}),
            })
            .catch(() => null);
          if (!result) return;
          void navigate({
            to: "/wallet/send/receipt",
            search: {
              trackingId: result.trackingId,
              recipient: recipientAddress,
              amount,
              symbol: selectedToken.symbol,
              ...(sharePayload ? { shared: true } : {}),
            },
          });
        }}
      />
    </div>
  );
}

function ShareCheckbox({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 border border-border p-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="block font-medium text-xs">{label}</span>
        <span className="block text-muted-foreground text-[0.6875rem]">{description}</span>
      </span>
    </label>
  );
}

function SendConfirmationSheet({
  open,
  onOpenChange,
  amount,
  symbol,
  recipient,
  note,
  sharePermission,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  symbol: string;
  recipient: `0x${string}` | null;
  note: string;
  sharePermission: number;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Confirm send</Trans>
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 pb-2">
            <div className="border border-border bg-card">
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <span className="text-muted-foreground text-xs">
                  <Trans>Amount</Trans>
                </span>
                <span className="font-mono text-xs font-semibold">
                  {amount} {symbol}
                </span>
              </div>
              <div
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 px-3 py-2.5",
                  (note || sharePermission !== 0) && "border-b border-border",
                )}
              >
                <span className="text-muted-foreground text-xs">
                  <Trans>Recipient</Trans>
                </span>
                {recipient ? <EllipsizedAddress address={recipient} /> : null}
              </div>
              {note ? (
                <div
                  className={cn(
                    "flex min-h-11 items-start justify-between gap-3 px-3 py-2.5",
                    sharePermission !== 0 && "border-b border-border",
                  )}
                >
                  <span className="shrink-0 text-muted-foreground text-xs">
                    <Trans>Message</Trans>
                  </span>
                  <span className="max-w-[70%] whitespace-pre-wrap text-right text-xs">{note}</span>
                </div>
              ) : null}
              {sharePermission !== 0 ? (
                <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Sharing</Trans>
                  </span>
                  <span className="text-right text-xs font-semibold">
                    {hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.location) ? (
                      <Trans>Location</Trans>
                    ) : null}
                    {hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.email) ? (
                      <>
                        {hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.location)
                          ? ", "
                          : null}
                        <Trans>Email</Trans>
                      </>
                    ) : null}
                    {hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.phone) ? (
                      <>
                        {hasSendSharePermission(
                          sharePermission,
                          SEND_SHARE_PERMISSION.location | SEND_SHARE_PERMISSION.email,
                        ) ||
                        hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.location) ||
                        hasSendSharePermission(sharePermission, SEND_SHARE_PERMISSION.email)
                          ? ", "
                          : null}
                        <Trans>Phone</Trans>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="px-6 pb-2 text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button className="h-11 w-full" disabled={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Sending…</Trans> : <Trans>Confirm and send</Trans>}
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
