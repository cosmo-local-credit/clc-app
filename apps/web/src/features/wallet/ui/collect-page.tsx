import { createRelayerClient } from "@clc/api/features/relayer/client";
import type { CollectState } from "@clc/core/features/nfc/collect";
import { isPayerUnresolved } from "@clc/core/features/nfc/collect";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { RiArrowDownSLine } from "react-icons/ri";
import { TbNfc } from "react-icons/tb";
import { useConnection } from "wagmi";

import { NfcCardPrompt, useNfcMessages } from "#/components/nfc-card-prompt";
import { Button } from "#/components/ui/button";
import { StatusPill, TokenLogo, WalletAmountInput } from "#/components/wallet";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import {
  type CollectDraft,
  type CollectNotice,
  useCardCollection,
} from "#/features/wallet/hooks/use-card-collection";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import type { CollectSubmission } from "#/features/wallet/state/collect-submissions";
import { CHAIN_ID } from "#/lib/chain";
import { useWebNfcSupported } from "#/lib/nfc/ndef-adapter";
import { RELAYER_URL } from "#/lib/relayer-config";
import { TokenPickerSheet } from "./token-picker-sheet";

const relayerClient = createRelayerClient(RELAYER_URL);

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

/** Digits and one decimal point, no more fraction digits than the token has. */
function sanitizeAmount(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, decimals);
  return `${cleaned.slice(0, firstDot)}.${fraction}`;
}

/**
 * Collect a payment by card. The collector sets voucher and amount, arms the
 * intent, and the payer presenting their card authorizes exactly what is on
 * screen — no further prompt for a raw card, the existing password step for an
 * encrypted one.
 */
export function CollectPage({ token }: { token?: string }) {
  const { t } = useLingui();
  const { address } = useConnection();
  const nfcSupported = useWebNfcSupported();
  const collection = useCardCollection({ collector: address });
  const { session, heldPayer, notice, unlock, scan, health } = collection;
  const tokensQuery = useAccountTokensInfinite(address);
  const tokens =
    tokensQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];

  const [selectedId, setSelectedId] = useState<string | undefined>(token?.toLowerCase());
  const selectedToken = tokens.find((item) => item.id === selectedId) ?? tokens[0];
  const [amount, setAmount] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const decimals = selectedToken?.tokenDecimals ?? 2;

  const draft = useMemo<CollectDraft | null>(() => {
    if (!selectedToken?.contractAddress || amount.trim() === "") return null;
    try {
      const amountRaw = parseTokenAmount(amount, decimals);
      if (BigInt(amountRaw) <= 0n) return null;
      return {
        token: {
          address: selectedToken.contractAddress as `0x${string}`,
          symbol: selectedToken.symbol,
          decimals,
        },
        amountRaw,
        amountLabel: amount,
      };
    } catch {
      return null;
    }
  }, [amount, decimals, selectedToken]);

  const phase = session.state.phase;
  const editable =
    phase === "idle" || phase === "submitted" || phase === "rejected" || phase === "unknown";
  const relayerReady =
    health.data !== undefined &&
    health.data.chainId === CHAIN_ID &&
    health.data.idempotentRelay === true;
  const canArm = nfcSupported && relayerReady && editable && draft !== null;
  const heldPayerBusy = heldPayer ? isPayerUnresolved(session, heldPayer) : false;
  const amountText = draft ? `${draft.amountLabel} ${draft.token.symbol}` : null;
  const armedAmount =
    session.state.phase === "armed"
      ? `${session.state.intent.amountLabel} ${session.state.intent.token.symbol}`
      : null;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Receive`} to="/wallet/receive" />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Collect by card</Trans>
      </h1>

      {!nfcSupported ? (
        <p className="mb-3 border border-border bg-card p-4 text-muted-foreground text-sm">
          <Trans>This phone or browser can't read NFC cards.</Trans>
        </p>
      ) : health.isError ? (
        <p role="alert" className="mb-3 border border-border bg-card p-4 text-destructive text-sm">
          <Trans>Couldn't reach the payment relay. Check your connection and try again.</Trans>
        </p>
      ) : health.data && !relayerReady ? (
        <p className="mb-3 border border-border bg-card p-4 text-muted-foreground text-sm">
          {health.data.chainId !== CHAIN_ID ? (
            <Trans>The payment relay is on a different network.</Trans>
          ) : (
            <Trans>Card collection isn't available on this server yet.</Trans>
          )}
        </p>
      ) : null}

      {address ? (
        <div className="mb-2.5 flex h-12 items-center gap-2.5 border border-border bg-card px-3">
          <span className="shrink-0 text-muted-foreground text-xs">
            <Trans>To</Trans>
          </span>
          <div className="min-w-0 flex-1">
            <RecipientIdentityLabel address={address} />
          </div>
          <span className="shrink-0 text-muted-foreground text-xs">
            <Trans>Your wallet</Trans>
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!selectedToken || !editable}
        className="mb-2.5 flex h-11 w-full items-center gap-2.5 border border-border bg-card px-3 text-start disabled:opacity-60"
      >
        {selectedToken ? (
          <>
            <TokenLogo token={selectedToken} size={30} />
            <p className="min-w-0 flex-1 truncate text-sm font-bold">{selectedToken.symbol}</p>
          </>
        ) : (
          <p className="min-w-0 flex-1 text-muted-foreground text-sm">
            {tokensQuery.isError ? (
              <Trans>Couldn't load vouchers</Trans>
            ) : tokensQuery.isSuccess ? (
              <Trans>No vouchers to collect</Trans>
            ) : (
              <Trans>Loading vouchers…</Trans>
            )}
          </p>
        )}
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <div className="mb-3">
        <WalletAmountInput
          label={t`Amount to collect`}
          value={amount}
          disabled={!editable}
          onValueChange={(value) => setAmount(sanitizeAmount(value, decimals))}
        />
      </div>

      <CollectStatus
        state={session.state}
        submissions={collection.submissions}
        heldPayer={heldPayer}
      />

      {phase === "armed" ? (
        <div className="mt-3">
          <NfcCardPrompt
            phase={scan.phase}
            error={scan.error}
            readFailed={scan.readFailed}
            title={<Trans>Present card to pay {armedAmount}</Trans>}
            onRetry={scan.start}
          />
        </div>
      ) : null}

      {unlock ? (
        <div className="mt-3 border border-border bg-card p-4">
          <Suspense fallback={null}>
            <EncryptedPaperWalletImportForm
              encryptedKey={unlock.encryptedKey}
              onDecrypted={collection.completeUnlock}
              onCancel={collection.cancelUnlock}
            />
          </Suspense>
        </div>
      ) : null}

      {notice ? <NoticeText notice={notice} /> : null}

      <div className="flex-1" />

      <div className="mt-4 space-y-2">
        {phase === "armed" ? (
          <>
            {notice?.kind === "latched" && heldPayer && draft ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => collection.collectAgain(draft)}
              >
                <Trans>Charge this card {amountText}</Trans>
              </Button>
            ) : null}
            <Button variant="ghost" size="lg" className="w-full" onClick={collection.cancelArmed}>
              <Trans>Cancel</Trans>
            </Button>
          </>
        ) : editable ? (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={!canArm}
              onClick={() => {
                if (draft) collection.arm(draft);
              }}
            >
              <TbNfc className="me-2 size-4" aria-hidden="true" />
              {amountText ? (
                <Trans>Ready to collect {amountText}</Trans>
              ) : (
                <Trans>Ready to collect</Trans>
              )}
            </Button>
            {heldPayer ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={!canArm || heldPayerBusy}
                  onClick={() => {
                    if (draft) collection.collectAgain(draft);
                  }}
                >
                  <Trans>Collect again from this card</Trans>
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  onClick={collection.finishCustomer}
                >
                  <Trans>Done with this customer</Trans>
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {collection.submissions.length > 0 ? (
        <section className="mt-6" aria-label={t`Recent collections`}>
          <h2 className="mb-2 font-heading text-[1.125rem] font-semibold tracking-tight">
            <Trans>Recent collections</Trans>
          </h2>
          <ul className="border border-border bg-card">
            {collection.submissions.map((submission) => (
              <CollectionRow
                key={submission.operationId}
                submission={submission}
                onSettled={collection.settle}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <TokenPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tokens={tokens}
        selectedId={selectedToken?.id}
        onSelect={(next) => {
          setSelectedId(next.id);
          setAmount((current) => sanitizeAmount(current, next.tokenDecimals ?? 2));
        }}
      />
    </div>
  );
}

function CollectStatus({
  state,
  submissions,
  heldPayer,
}: {
  state: CollectState;
  submissions: CollectSubmission[];
  heldPayer: `0x${string}` | null;
}) {
  const { t } = useLingui();
  if (state.phase === "idle" || state.phase === "armed" || state.phase === "unlocking") {
    return heldPayer ? (
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Trans>Card held:</Trans> <EllipsizedAddress address={heldPayer} />
      </p>
    ) : null;
  }

  const amount = `${state.intent.amountLabel} ${state.intent.token.symbol}`;
  if (state.phase === "processing") {
    return (
      <div className="flex items-center gap-3 border border-border bg-card p-4" aria-live="polite">
        <FiLoader className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium text-sm">
            <Trans>Card read — processing {amount}</Trans>
          </p>
          <EllipsizedAddress address={state.payer} />
        </div>
      </div>
    );
  }

  if (state.phase === "checking") {
    return (
      <div className="space-y-1 border border-border bg-card p-4" aria-live="polite">
        <p className="flex items-center gap-2 font-medium text-sm">
          <FiLoader className="size-4 animate-spin text-primary" aria-hidden="true" />
          <Trans>Checking payment…</Trans>
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>
            The connection dropped before the relay answered. Don't charge this card again until
            this resolves.
          </Trans>
        </p>
      </div>
    );
  }

  if (state.phase === "unknown") {
    return (
      <div role="alert" className="space-y-1 border border-border bg-card p-4">
        <p className="font-medium text-sm">
          <Trans>Payment status unknown</Trans>
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>
            The request expired without an answer from the relay. Check the customer's balance
            before charging the card again.
          </Trans>
        </p>
      </div>
    );
  }

  if (state.phase === "rejected") {
    const { detail } = state;
    const symbol = state.intent.token.symbol;
    const message = (() => {
      switch (state.reason) {
        case "self-payment":
          return t`This card holds your own wallet. Nothing was charged.`;
        case "insufficient-balance":
          return t`This card doesn't have enough ${symbol}. Nothing was charged.`;
        case "unlock-cancelled":
          return t`The card wasn't unlocked. Nothing was charged.`;
        case "chain-mismatch":
          return t`The payment relay is on a different network. Nothing was charged.`;
        case "relay-rejected":
          return detail
            ? t`The payment was refused: ${detail}`
            : t`The payment was refused. Nothing was charged.`;
        default:
          return detail
            ? t`The payment couldn't be prepared: ${detail}`
            : t`The payment couldn't be prepared. Nothing was charged.`;
      }
    })();
    return (
      <p role="alert" className="border border-border bg-card p-4 text-destructive text-sm">
        {message}
      </p>
    );
  }

  const status = submissions.find((entry) => entry.operationId === state.intent.id)?.status;
  return (
    <div
      className="flex items-center justify-between gap-3 border border-border bg-card p-4"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="font-medium text-sm">
          {status === "confirmed" ? (
            <Trans>Payment confirmed</Trans>
          ) : status === "failed" ? (
            <Trans>Payment failed</Trans>
          ) : (
            <Trans>Payment accepted — confirming</Trans>
          )}
        </p>
        <p dir="ltr" className="font-mono text-muted-foreground text-xs">
          {amount}
        </p>
      </div>
      <SubmissionPill status={status ?? "pending"} hasTracking />
    </div>
  );
}

function SubmissionPill({
  status,
  hasTracking,
}: {
  status: CollectSubmission["status"];
  hasTracking: boolean;
}) {
  switch (status) {
    case "confirmed":
      return <StatusPill tone="success" label={<Trans>Confirmed</Trans>} />;
    case "failed":
      return <StatusPill tone="error" label={<Trans>Failed</Trans>} />;
    case "unknown":
      return <StatusPill tone="error" label={<Trans>Unknown</Trans>} />;
    default:
      return (
        <StatusPill
          tone="pending"
          label={hasTracking ? <Trans>Pending</Trans> : <Trans>Checking</Trans>}
        />
      );
  }
}

function NoticeText({ notice }: { notice: CollectNotice }) {
  const messages = useNfcMessages();
  return (
    <p role="alert" className="mt-3 text-destructive text-xs">
      {notice.kind === "card" ? (
        messages.problem(notice.problem)
      ) : notice.kind === "latched" ? (
        <Trans>This card just paid. To charge it again, choose Charge this card.</Trans>
      ) : notice.kind === "payer-unresolved" ? (
        <Trans>
          This card's last payment is still being confirmed. Wait for it before charging the card
          again.
        </Trans>
      ) : notice.kind === "self-payment" ? (
        <Trans>This card holds your own wallet. Use the customer's card.</Trans>
      ) : (
        <Trans>Tap Ready to collect before presenting a card.</Trans>
      )}
    </p>
  );
}

/** One collection, tracked until it settles. Settling frees its payer. */
function CollectionRow({
  submission,
  onSettled,
}: {
  submission: CollectSubmission;
  onSettled: (operationId: string, outcome: "confirmed" | "failed") => void;
}) {
  const pending = submission.status === "pending";
  const tracking = useOtxTracking(pending ? submission.trackingId : null, {
    queryKey: "collect-relay-track",
    queryFn: async (trackingId) => (await relayerClient.trackRelay(trackingId)).result,
  });
  const { operationId } = submission;
  const outcome = tracking.outcome.kind;
  // A failed poll is not a failed payment: only the relay's own verdict settles it.
  const settled = pending && !tracking.isError && outcome !== "pending";

  useEffect(() => {
    if (settled) onSettled(operationId, outcome === "success" ? "confirmed" : "failed");
  }, [onSettled, operationId, outcome, settled]);

  return (
    <li className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        <p dir="ltr" className="font-mono text-xs font-semibold">
          {submission.amountLabel} {submission.token.symbol}
        </p>
        <EllipsizedAddress address={submission.payer} />
      </div>
      <SubmissionPill status={submission.status} hasTracking={submission.trackingId !== null} />
    </li>
  );
}
