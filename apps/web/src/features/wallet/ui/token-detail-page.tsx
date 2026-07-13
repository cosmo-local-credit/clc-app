import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiDownloadLine,
  RiExchangeFundsLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import {
  EllipsizedAddress,
  HighlightAddress,
  TokenLogo,
  TransferDetailsSheet,
  WALLET_TOKEN_BY_ID,
  type TransferDetails,
  type WalletToken,
} from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  useAccountTokensInfinite,
  useAccountTransfersInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { VoucherContactDetails } from "./voucher-contact-details";

type TxKind = "in" | "out" | "swap";
type VoucherDetailTab = "activity" | "info";

const TX_ICON: Record<TxKind, ReactNode> = {
  in: <RiArrowLeftDownLine className="size-3.5" aria-hidden="true" />,
  out: <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />,
  swap: <RiExchangeFundsLine className="size-3.5" aria-hidden="true" />,
};

const TX_ICON_CLASS: Record<TxKind, string> = {
  in: "text-primary",
  out: "text-destructive",
  swap: "text-primary",
};

export function TokenDetailPage({ tokenId }: { tokenId: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useAccount();
  const tokensQuery = useAccountTokensInfinite(address, 50);
  const transfersQuery = useAccountTransfersInfinite(address);
  const [activeTab, setActiveTab] = useState<VoucherDetailTab>("activity");
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const fetchedTokens =
    tokensQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];
  const fetchedToken = fetchedTokens.find((item) => item.id === tokenId.toLowerCase());
  const staticToken = WALLET_TOKEN_BY_ID[tokenId];
  const token: WalletToken = fetchedToken ??
    staticToken ?? {
      id: tokenId.toLowerCase(),
      symbol: "TOKEN",
      name: "Token",
      amount: "—",
      fiat: "",
      color: "oklch(0.58 0.16 210)",
      kind: "voucher",
      contractAddress: tokenId,
    };
  const contractAddress = token.contractAddress ?? token.owner;
  const transfers = useMemo(() => {
    const allTransfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
    if (!contractAddress) return allTransfers;
    return allTransfers.filter(
      (transfer) => transfer.tokenAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
  }, [contractAddress, transfersQuery.data]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      activeTab !== "activity" ||
      !transfersQuery.hasNextPage ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !transfersQuery.isFetchingNextPage) {
        void transfersQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeTab,
    transfersQuery.fetchNextPage,
    transfersQuery.hasNextPage,
    transfersQuery.isFetchingNextPage,
  ]);

  // Carry the token's contract address into the send flow so the amount step
  // preselects this voucher. Swap wiring is deferred.
  const sendToken = token.contractAddress ?? token.id;
  const actions: { id: string; label: ReactNode; icon: ReactNode; onClick?: () => void }[] = [
    {
      id: "send",
      label: <Trans>Send</Trans>,
      icon: <RiSendPlane2Line className="size-4" aria-hidden="true" />,
      onClick: () => {
        void navigate({ to: "/wallet/send", search: { token: sendToken } });
      },
    },
    {
      id: "receive",
      label: <Trans>Receive</Trans>,
      icon: <RiDownloadLine className="size-4" aria-hidden="true" />,
      onClick: () => {
        void navigate({ to: "/wallet/receive" });
      },
    },
    {
      id: "swap",
      label: <Trans>Swap</Trans>,
      icon: <RiExchangeFundsLine className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Your Vouchers`} to="/" />

      <div className="flex flex-col items-center">
        <TokenLogo token={token} size={56} />
        <p className="mt-3 text-muted-foreground text-sm">{token.name}</p>
        <p className="min-w-0 truncate font-heading text-[2.125rem] font-semibold leading-none tracking-tight">
          {token.amount} <span className="text-sm text-muted-foreground">{token.symbol}</span>
        </p>
      </div>

      <div className="my-4 grid grid-cols-3 gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            className="h-14 flex-col gap-1"
            disabled={!action.onClick}
            onClick={action.onClick}
          >
            {action.icon}
            <span className="text-xs font-semibold">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Owner-only voucher admin actions (Mint to / Transfer) belong here. Hidden for non-owner users. */}

      {contractAddress ? (
        <div className="mb-4 border border-border bg-card p-3">
          <p className="font-heading text-xs font-semibold tracking-tight text-foreground">
            <Trans>Contract address</Trans>
          </p>
          <button
            type="button"
            aria-label={t`Copy contract address`}
            className="mt-2 w-full break-all text-left"
            onClick={() => {
              if (!navigator.clipboard) {
                toast.error(t`Couldn't copy contract address`);
                return;
              }
              void navigator.clipboard
                .writeText(contractAddress)
                .then(() => toast.success(t`Contract address copied`))
                .catch(() => toast.error(t`Couldn't copy contract address`));
            }}
          >
            <HighlightAddress address={contractAddress} tailLength={6} />
          </button>
        </div>
      ) : null}

      <div
        className="mb-3 grid grid-cols-2 border border-border bg-card p-1"
        role="tablist"
        aria-label={t`Voucher details`}
      >
        {(
          [
            { id: "activity", label: <Trans>Activity</Trans> },
            { id: "info", label: <Trans>Info</Trans> },
          ] satisfies { id: VoucherDetailTab; label: ReactNode }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={[
              "h-9 px-3 font-semibold text-xs",
              activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            ].join(" ")}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "activity" ? (
        <div className="border border-border bg-card" role="tabpanel">
          {transfersQuery.isPending ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>Loading activity…</Trans>
            </div>
          ) : null}
          {transfersQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load activity.</Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-card"
                onClick={() => transfersQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {transfersQuery.isSuccess && transfers.length === 0 ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>No activity yet.</Trans>
            </div>
          ) : null}
          {transfers.map((transfer, index, list) => {
            const kind = transfer.direction === "IN" ? "in" : "out";
            const transferDate = formatTransferDate(transfer.dateBlock);
            return (
              <button
                key={`${transfer.txHash}-${transfer.id}`}
                type="button"
                className={[
                  "flex w-full items-center gap-2.5 p-3 text-left",
                  index < list.length - 1 ? "border-b border-border" : "",
                ].join(" ")}
                onClick={() => setSelectedTransfer(transfer)}
              >
                <span
                  className={[
                    "flex size-7 shrink-0 items-center justify-center bg-muted",
                    TX_ICON_CLASS[kind],
                  ].join(" ")}
                >
                  {TX_ICON[kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {transfer.direction === "IN" ? <Trans>Received</Trans> : <Trans>Sent</Trans>}
                  </p>
                  <p className="truncate text-muted-foreground text-[0.6875rem]">
                    {transfer.direction === "IN" ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                    <EllipsizedAddress address={transfer.counterpartyAddress} />
                    {transferDate ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <time dateTime={transfer.dateBlock}>{transferDate}</time>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold">
                  {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}
                </span>
              </button>
            );
          })}
          <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
          {transfersQuery.isFetchingNextPage ? (
            <div className="p-3 text-center text-muted-foreground text-xs">
              <Trans>Loading more…</Trans>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3" role="tabpanel">
          {token.location || token.phone || token.email || token.ownerEns ? (
            <div className="border border-border bg-card p-3">
              <VoucherContactDetails voucher={token} showOwnerAddress={false} />
            </div>
          ) : null}

          {typeof token.lat === "number" && typeof token.lng === "number" ? (
            <Suspense fallback={<div className="h-36 w-full bg-muted" />}>
              <LocationMap lat={token.lat} lng={token.lng} className="h-36 rounded-none" />
            </Suspense>
          ) : null}

          {/* UI-only CTA: wire to this voucher's marketplace offerings once listings exist. */}
          <Button className="h-11 w-full">
            <Trans>Show offerings</Trans>
          </Button>
        </div>
      )}

      <TransferDetailsSheet
        transfer={selectedTransfer}
        open={selectedTransfer !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTransfer(null);
        }}
      />
    </div>
  );
}
