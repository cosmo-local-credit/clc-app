import { Trans, useLingui } from "@lingui/react/macro";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiDownloadLine,
  RiExchangeFundsLine,
  RiGroupLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  SectionHeader,
  TokenLogo,
  WALLET_POOLS,
  WALLET_TOKENS,
  WALLET_TOTAL_BALANCE,
} from "#/components/wallet";

export function WalletPage() {
  const { t } = useLingui();
  const actions = [
    { id: "send", label: t`Send`, icon: RiSendPlane2Line, primary: true, href: "/wallet/send" },
    {
      id: "receive",
      label: t`Receive`,
      icon: RiDownloadLine,
      primary: false,
      href: "/wallet/receive",
    },
    { id: "swap", label: t`Swap`, icon: RiExchangeFundsLine, primary: false, href: "/wallet/swap" },
    { id: "topup", label: t`Top up`, icon: RiBankCardLine, primary: false, href: "/wallet/top-up" },
  ] as const;
  const orderedTokens = [...WALLET_TOKENS].sort((left, right) => {
    if (left.kind === right.kind) return 0;
    return left.kind === "stable" ? -1 : 1;
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1>
          <Trans>Wallet</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Manage vouchers, pools, and local payments.</Trans>
        </p>
      </div>

      <section aria-label="Wallet balance" className="space-y-3">
        <div className="border border-border bg-card p-4">
          <p className="mb-1 text-muted-foreground text-xs">
            <Trans>Total balance</Trans>
          </p>
          <p className="font-heading text-[2.75rem] font-semibold leading-none tracking-tight">
            {WALLET_TOTAL_BALANCE}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant={action.primary ? "default" : "outline"}
                className="h-[3.625rem] flex-col gap-1 px-1 text-[0.6875rem]"
                onClick={() => {
                  window.location.assign(action.href);
                }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {action.label}
              </Button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="your-vouchers-title">
        <SectionHeader
          title={<Trans>Your Vouchers</Trans>}
          action={<Trans>View all</Trans>}
          onAction={() => {
            window.location.assign("/wallet/vouchers");
          }}
        />
        <div className="border border-border bg-card">
          {orderedTokens.map((token, index, list) => (
            <button
              key={token.id}
              type="button"
              className={[
                "flex w-full items-center gap-3 p-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => {
                window.location.assign(`/wallet/tokens/${token.id}`);
              }}
            >
              <TokenLogo token={token} size={34} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm tracking-tight">{token.symbol}</p>
                <p className="truncate text-muted-foreground text-xs">{token.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-heading text-sm font-semibold tracking-tight">{token.amount}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="your-pools-title">
        <SectionHeader title={<Trans>Your Pools</Trans>} action={<Trans>View all</Trans>} />
        <div className="border border-border bg-card">
          {WALLET_POOLS.map((pool, index, list) => (
            <button
              key={pool.id}
              type="button"
              className={[
                "flex w-full items-center gap-3 p-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
            >
              <span className="flex size-7 shrink-0 items-center justify-center bg-muted text-foreground">
                <RiGroupLine className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{pool.name}</p>
              </div>
              <RiArrowRightSLine
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
