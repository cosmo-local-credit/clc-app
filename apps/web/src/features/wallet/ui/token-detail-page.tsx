import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiCopperCoinLine,
  RiDownloadLine,
  RiExchangeFundsLine,
  RiFileCopyLine,
  RiMailLine,
  RiMapPin2Line,
  RiPhoneLine,
  RiSendPlane2Line,
  RiUser3Line,
  RiUserReceivedLine,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  HighlightAddress,
  SectionHeader,
  TokenLogo,
  WALLET_TOKEN_BY_ID,
  type WalletToken,
} from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";

type TxKind = "in" | "out" | "swap";

type TokenTx = {
  kind: TxKind;
  title: string;
  who: string;
  amount: string;
};

const TXS: TokenTx[] = [
  { kind: "in", title: "Received", who: "from cosmo.clc", amount: "+ 500.00" },
  { kind: "out", title: "Sent", who: "to Green Basket", amount: "\u2212 120.00" },
  { kind: "swap", title: "Swapped", who: "from USDC", amount: "+ 1,470.00" },
];

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

function AdminActions() {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        className="h-[4.5rem] flex-col gap-1 border-primary/40 text-primary"
      >
        <RiCopperCoinLine className="size-4" aria-hidden="true" />
        <span className="text-xs font-semibold">
          <Trans>Mint to</Trans>
        </span>
      </Button>
      <Button
        variant="outline"
        className="h-[4.5rem] flex-col gap-1 border-primary/40 text-primary"
      >
        <RiUserReceivedLine className="size-4" aria-hidden="true" />
        <span className="text-xs font-semibold">
          <Trans>Transfer</Trans>
        </span>
      </Button>
    </div>
  );
}

function DetailsPanel({ token }: { token: WalletToken }) {
  return (
    <div className="mb-4 border border-border bg-card p-3">
      <h3 className="font-heading mb-2 text-xs font-semibold tracking-tight">
        <Trans>Details</Trans>
      </h3>
      {token.location ? (
        <DetailRow
          icon={<RiMapPin2Line className="size-3" aria-hidden="true" />}
          value={token.location}
        />
      ) : null}
      {token.phone ? (
        <DetailRow
          icon={<RiPhoneLine className="size-3" aria-hidden="true" />}
          value={token.phone}
        />
      ) : null}
      {token.email ? (
        <DetailRow
          icon={<RiMailLine className="size-3" aria-hidden="true" />}
          value={token.email}
        />
      ) : null}
      {token.owner ? (
        <div className="flex items-center gap-2">
          <RiUser3Line className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          {token.ownerEns ? <span className="text-xs">{token.ownerEns}</span> : null}
          <span className="text-muted-foreground">
            {token.owner.length > 12 ? (
              <HighlightAddress address={token.owner} />
            ) : (
              <span className="font-mono text-xs">{token.owner}</span>
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}

export function TokenDetailPage({ tokenId }: { tokenId: string }) {
  const { t } = useLingui();
  const token = WALLET_TOKEN_BY_ID[tokenId] ?? WALLET_TOKEN_BY_ID.babas;

  const actions: { id: string; label: ReactNode; icon: ReactNode }[] = [
    {
      id: "send",
      label: <Trans>Send</Trans>,
      icon: <RiSendPlane2Line className="size-4" aria-hidden="true" />,
    },
    {
      id: "receive",
      label: <Trans>Receive</Trans>,
      icon: <RiDownloadLine className="size-4" aria-hidden="true" />,
    },
    {
      id: "swap",
      label: <Trans>Swap</Trans>,
      icon: <RiExchangeFundsLine className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Your Vouchers`} onClick={() => window.history.back()} />

      <div className="flex flex-col items-center">
        <TokenLogo token={token} size={56} />
        <p className="mt-3 text-muted-foreground text-sm">{token.name}</p>
        <p className="font-heading text-[2.125rem] font-semibold leading-none tracking-tight">
          {token.amount} <span className="text-sm text-muted-foreground">{token.symbol}</span>
        </p>
      </div>

      <div className="my-4 grid grid-cols-3 gap-2">
        {actions.map((action) => (
          <Button key={action.id} variant="outline" className="h-[4.5rem] flex-col gap-1">
            {action.icon}
            <span className="text-xs font-semibold">{action.label}</span>
          </Button>
        ))}
      </div>

      {token.admin ? <AdminActions /> : null}

      {token.location || token.phone || token.email || token.owner ? (
        <DetailsPanel token={token} />
      ) : null}

      <div className="mb-4 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Network</Trans>
          </span>
          <span className="text-xs font-semibold">Celo · ERC-20</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Contract</Trans>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            {token.owner ? (
              <HighlightAddress address={token.owner} className="text-[0.6875rem]" />
            ) : null}
            <RiFileCopyLine className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
        </div>
      </div>

      <SectionHeader title={t`Activity`} />
      <div className="border border-border bg-card">
        {TXS.map((tx, index, list) => (
          <div
            key={`${tx.title}-${tx.who}`}
            className={[
              "flex items-center gap-2.5 p-3",
              index < list.length - 1 ? "border-b border-border" : "",
            ].join(" ")}
          >
            <span
              className={[
                "flex size-7 shrink-0 items-center justify-center bg-muted",
                TX_ICON_CLASS[tx.kind],
              ].join(" ")}
            >
              {TX_ICON[tx.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{tx.title}</p>
              <p className="text-muted-foreground text-[0.6875rem]">{tx.who}</p>
            </div>
            <span className="shrink-0 font-mono text-xs font-semibold">{tx.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
