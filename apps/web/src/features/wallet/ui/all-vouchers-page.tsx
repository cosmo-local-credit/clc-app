import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiArrowDownSLine, RiArrowRightSLine } from "react-icons/ri";

import { PicsumLogo, WALLET_TOKENS, type WalletToken } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { VoucherContactDetails } from "./voucher-contact-details";

function VoucherRow({
  voucher,
  open,
  onToggle,
  showBorder,
}: {
  voucher: WalletToken;
  open: boolean;
  onToggle: () => void;
  showBorder: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={[
          "flex w-full items-center gap-2.5 p-3 text-left",
          showBorder ? "border-b border-border" : "",
        ].join(" ")}
      >
        <PicsumLogo seed={`voucher-${voucher.id}`} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold tracking-tight">{voucher.symbol}</p>
            {voucher.admin ? (
              <span className="bg-primary px-1 py-px text-[0.5rem] font-bold tracking-[0.06em] uppercase text-primary-foreground">
                <Trans>Admin</Trans>
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{voucher.name}</p>
        </div>
        <p className="shrink-0 font-heading text-sm font-semibold tracking-tight">
          {voucher.amount}
        </p>
        <RiArrowDownSLine
          className={[
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className={["px-3 pb-3 pt-1", showBorder ? "border-b border-border" : ""].join(" ")}>
          <VoucherContactDetails voucher={voucher} />
          <Link
            to="/wallet/tokens/$tokenId"
            params={{ tokenId: voucher.id }}
            preload="intent"
            className="mt-3 flex h-11 items-center justify-center gap-1.5 bg-primary px-3 font-semibold text-primary-foreground text-xs"
          >
            <Trans>View voucher</Trans>
            <RiArrowRightSLine className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function AllVouchersPage() {
  const { t } = useLingui();
  const vouchers = WALLET_TOKENS.filter((token) => token.kind === "voucher");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Wallet`} onClick={() => window.history.back()} />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>All Vouchers</Trans>
      </h1>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        <Trans>Community vouchers and their details.</Trans>
      </p>

      <div className="border border-border bg-card">
        {vouchers.map((voucher, index, list) => {
          const isOpen = expanded[voucher.id] ?? false;
          return (
            <VoucherRow
              key={voucher.id}
              voucher={voucher}
              open={isOpen}
              onToggle={() => setExpanded((prev) => ({ ...prev, [voucher.id]: !prev[voucher.id] }))}
              showBorder={index < list.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}
