import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { useLingui } from "@lingui/react/macro";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";

import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { type SendDraft, useKeepSendDraft } from "#/features/wallet/hooks/use-send-draft";
import {
  SEND_VOUCHER_MUTATION_KEY,
  useSendVoucherTransfer,
} from "#/features/wallet/hooks/use-send-voucher-transfer";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
import {
  checkSendAmount,
  sanitizeSendAmount,
  seededRecipientContext,
} from "#/features/wallet/logic/send-amount";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import type { ViewDraft } from "#/lib/view-drafts";

/**
 * One payment on Send, for both views: the voucher, the amount and its value,
 * the checks that arm it, and the relay that ends on the receipt. The views
 * own only how the recipient is chosen and how all of it is laid out.
 *
 * `inFlight` reads the mutation cache, not this view's own mutation: after a
 * layout switch the view that relayed the payment is gone, its `mutateAsync`
 * still out (it still lands on the receipt), and the view that replaced it
 * restored the same fields. It stays disarmed until that relay settles.
 */
export function useSendPayment({
  sender,
  draft,
  seed,
  query,
  recipient,
}: {
  sender: `0x${string}` | undefined;
  /** The view's draft; its restored voucher and amount win over the seed. */
  draft: ViewDraft<SendDraft>;
  /** What the URL or a shortcut chose. */
  seed: {
    token?: string;
    amount?: string;
    recipient?: string;
    recipientLabel?: string;
    returnPool?: string;
  };
  /** What is in the recipient field, kept in the draft. */
  query: string;
  /** Who is being paid, as the view resolved or was handed it. */
  recipient: ResolvedRecipientAddress | null;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const delegationStatus = useCaliburDelegation(sender);
  const tokensQuery = useAllAccountTokens(sender);
  const sendVoucher = useSendVoucherTransfer();
  const inFlight = useIsMutating({ mutationKey: SEND_VOUCHER_MUTATION_KEY }) > 0;
  const tokens = tokensQuery.tokens
    .filter((item) => item.catalogActive !== false)
    .map(accountTokenToWalletToken);
  const restored = draft.restored;

  // Preselect the requested voucher, else the first once balances load. Never
  // substitute another asset for a retired selection. The id is the lowercased
  // contract address.
  const [selectedId, setSelectedId] = useState<string | undefined>(
    (restored?.token ?? seed.token)?.toLowerCase(),
  );
  const selectedToken = selectedId ? tokens.find((item) => item.id === selectedId) : tokens[0];
  const firstTokenId = tokens[0]?.id;
  useEffect(() => {
    if (!selectedId && firstTokenId) setSelectedId(firstTokenId);
  }, [selectedId, firstTokenId]);

  // Seeded once. The seed is a starting point a shortcut chose, not a
  // controlled value — typing over it must not be undone by a re-render.
  const [amount, setAmountValue] = useState(() =>
    sanitizeSendAmount(restored ? restored.amount : (seed.amount ?? "")),
  );
  // "Max" sends the exact raw balance rather than the two places shown.
  const [maxAmountRaw, setMaxAmountRaw] = useState<string | null>(null);

  const tokenDecimals = selectedToken?.tokenDecimals ?? 2;
  const voucherDetail = useMarketVoucherDetail(selectedToken?.contractAddress);
  const amountRaw = useMemo(() => {
    if (!selectedToken || amount.trim() === "") return null;
    try {
      return maxAmountRaw ?? parseTokenAmount(amount, tokenDecimals);
    } catch {
      return null;
    }
  }, [amount, maxAmountRaw, selectedToken, tokenDecimals]);
  const exactVoucherAmount =
    amountRaw === null ? null : formatTokenAmount(amountRaw, tokenDecimals, tokenDecimals);
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

  const { valid, exceedsBalance } = checkSendAmount({
    amount,
    amountRaw,
    balanceRaw: selectedToken?.balance ?? null,
    displayBalance: selectedToken?.amount,
  });
  const recipientAddress = recipient?.address ?? null;
  const { recipientLabel, returnPool } = seededRecipientContext(recipient, seed);
  const contractAddress = selectedToken?.contractAddress;
  const tokenAddress =
    contractAddress && isAddress(contractAddress, { strict: false })
      ? getAddress(contractAddress)
      : null;
  const canSend =
    !!sender &&
    !!recipientAddress &&
    !!tokenAddress &&
    !!selectedToken &&
    delegationStatus !== "checking" &&
    valid &&
    !exceedsBalance;

  useKeepSendDraft(draft, {
    query,
    recipient,
    amount,
    // The displayed default is a selection too. Keep its id even if a later
    // balance response removes it, rather than substituting another asset.
    token: selectedId ?? selectedToken?.id,
  });

  function setAmount(raw: string) {
    setMaxAmountRaw(null);
    setAmountValue(sanitizeSendAmount(raw));
  }

  function setMax() {
    if (!selectedToken) return;
    if (selectedToken.balance) {
      setAmountValue(formatTokenAmountFixed(selectedToken.balance, tokenDecimals, 2));
      setMaxAmountRaw(selectedToken.balance);
      return;
    }
    setMaxAmountRaw(null);
    setAmountValue(selectedToken.amount.replace(/,/g, ""));
  }

  function selectToken(id: string) {
    setMaxAmountRaw(null);
    setSelectedId(id);
  }

  /** Relays the payment and opens its receipt. Resolves without one when it fails. */
  async function confirm() {
    if (
      // The cache, not this render's `inFlight`: a second press that lands
      // before the button re-renders as pending must not relay twice.
      queryClient.isMutating({ mutationKey: SEND_VOUCHER_MUTATION_KEY }) > 0 ||
      !canSend ||
      !sender ||
      !selectedToken ||
      !amountRaw ||
      !tokenAddress ||
      !recipientAddress
    ) {
      return;
    }
    const result = await sendVoucher
      .mutateAsync({
        senderAddress: sender,
        tokenAddress,
        recipientAddress,
        amountRaw,
        includeAuthorization: delegationStatus === "not-delegated",
      })
      .catch(() => null);
    if (!result) return;
    draft.clear();
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
        recipientLabel,
        amount: submittedVoucherAmount,
        symbol: selectedToken.symbol,
        ...(submittedUnitValue
          ? { uoaValue: submittedUnitValue.value, uoa: submittedUnitValue.unit }
          : { uoaUnavailable: true }),
        returnPool,
      },
    });
  }

  return {
    tokens,
    tokensQuery,
    selectedToken,
    selectToken,
    amount,
    setAmount,
    setMax,
    exactVoucherAmount,
    submittedVoucherAmount,
    unitValueLabel,
    exceedsBalance,
    recipientAddress,
    recipientLabel,
    canSend,
    inFlight,
    error: sendVoucher.error instanceof Error ? sendVoucher.error.message : null,
    confirm,
  };
}
