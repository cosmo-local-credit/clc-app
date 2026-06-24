import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiDownloadLine,
  RiExchangeFundsLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { HighlightAddress, PicsumLogo, WALLET_TOKEN_BY_ID } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { VoucherContactDetails } from "./voucher-contact-details";

type TxKind = "in" | "out" | "swap";
type VoucherDetailTab = "activity" | "info";

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

export function TokenDetailPage({ tokenId }: { tokenId: string }) {
  const { t } = useLingui();
  const token = WALLET_TOKEN_BY_ID[tokenId] ?? WALLET_TOKEN_BY_ID.babas;
  const contractAddress = token.contractAddress ?? token.owner;
  const [activeTab, setActiveTab] = useState<VoucherDetailTab>("activity");

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
        <PicsumLogo seed={`voucher-${token.id}`} size={56} />
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

          <Button className="h-11 w-full">
            <Trans>Show offerings</Trans>
          </Button>
        </div>
      )}
    </div>
  );
}
