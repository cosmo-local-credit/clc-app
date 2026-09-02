import { chainHasPretiumRamp } from "@clc/core/features/wallet/pretium";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { RiBankCardLine, RiDownloadLine, RiGroupLine, RiSendPlane2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SectionHeader, TokenLogo } from "#/components/wallet";
import { useLatestAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { CHAIN_ID } from "#/lib/chain";

export function WalletPage({ address }: { address?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  // Pretium's ramps exist only on the chains its worker watches; elsewhere the
  // tile would lead to a screen that can do nothing.
  const actions = [
    { id: "send", label: t`Send`, icon: RiSendPlane2Line, variant: "default", to: "/wallet/send" },
    {
      id: "receive",
      label: t`Receive`,
      icon: RiDownloadLine,
      variant: "outline",
      to: "/wallet/receive",
    },
    ...(chainHasPretiumRamp(CHAIN_ID)
      ? ([
          {
            id: "topup",
            label: t`Cash`,
            icon: RiBankCardLine,
            variant: "outline",
            to: "/wallet/top-up",
          },
        ] as const)
      : []),
    { id: "pools", label: t`Pools`, icon: RiGroupLine, variant: "info", to: "/pools" },
  ] as const;
  const vouchersQuery = useLatestAccountTokens(address);
  const vouchers = vouchersQuery.data?.tokens.map(accountTokenToWalletToken) ?? [];

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

      <section aria-label={t`Wallet actions`} className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                asChild
                variant={action.variant}
                className="h-14 flex-col gap-1 px-1 text-[0.6875rem]"
              >
                <Link to={action.to}>
                  <Icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="your-vouchers-title">
        <SectionHeader
          id="your-vouchers-title"
          title={<Trans>Your Vouchers</Trans>}
          action={<Trans>View all</Trans>}
          onAction={() => {
            void navigate({ to: "/wallet/vouchers" });
          }}
        />
        <div className="border border-border bg-card">
          {vouchersQuery.isPending ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>Loading vouchers…</Trans>
            </div>
          ) : null}
          {vouchersQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-card"
                onClick={() => vouchersQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {vouchersQuery.isSuccess && vouchers.length === 0 ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>No vouchers yet.</Trans>
            </div>
          ) : null}
          {vouchers.map((token, index, list) => (
            <button
              key={token.id}
              type="button"
              className={[
                "flex w-full items-center gap-3 p-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => {
                void navigate({
                  to: "/vouchers/$voucherAddress",
                  params: { voucherAddress: token.id },
                  search: { from: "wallet" },
                });
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
    </div>
  );
}
