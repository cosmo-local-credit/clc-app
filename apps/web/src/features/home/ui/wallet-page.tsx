import { Trans } from "@lingui/react/macro";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiCoupon3Line,
  RiDownloadLine,
  RiExchangeFundsLine,
  RiGroupLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";

const placeholderActivity = [
  {
    id: "a1",
    title: "Sent to Cosmo Bakery",
    meta: "Today",
    amount: "- KSh 320",
  },
  { id: "a2", title: "Received voucher", meta: "Today", amount: "+ KSh 1,000" },
  {
    id: "a3",
    title: "Swapped pool credits",
    meta: "Yesterday",
    amount: "KSh 450",
  },
  {
    id: "a4",
    title: "Redeemed at Green Basket",
    meta: "Yesterday",
    amount: "- KSh 280",
  },
  { id: "a5", title: "Top up", meta: "2 days ago", amount: "+ KSh 2,500" },
];

const placeholderVouchers = [
  { id: "garden", name: "Community Garden Access", balance: "KSh 2,400" },
  { id: "bakery", name: "Bakery Credit", balance: "KSh 1,120" },
];

const placeholderPools = [
  { id: "solar", name: "Local Solar Coop" },
  { id: "food", name: "Fresh Food Circle" },
];

export function WalletPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold font-heading text-[1.75rem] leading-tight">
          <Trans>Wallet</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Manage vouchers, pools, and local payments.</Trans>
        </p>
      </div>

      <section aria-label="Wallet balance" className="space-y-3">
        <div className="border border-border bg-card p-4">
          <p className="font-heading font-semibold text-[2.75rem] leading-none tracking-tight">
            KSh 12,840
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-medium text-xs">
              <span className="size-2 rounded-full bg-primary" />3 vouchers
            </span>
            <span className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 font-medium text-xs">
              <span className="size-2 rounded-full bg-yellow-500" />2 pools
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button className="h-11 px-2 text-xs">
            <RiSendPlane2Line className="mr-1.5 size-4" aria-hidden="true" />
            <Trans>Send</Trans>
          </Button>
          <Button variant="outline" className="h-11 px-2 text-xs">
            <RiDownloadLine className="mr-1.5 size-4" aria-hidden="true" />
            <Trans>Receive</Trans>
          </Button>
          <Button variant="outline" className="h-11 px-2 text-xs">
            <RiBankCardLine className="mr-1.5 size-4" aria-hidden="true" />
            <Trans>Top up</Trans>
          </Button>
        </div>
      </section>

      <RecentActivity />

      <VoucherListSection />

      <PoolListSection />
    </div>
  );
}

function RecentActivity() {
  return (
    <section aria-labelledby="recent-activity-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="recent-activity-title" className="font-heading font-semibold text-base">
          <Trans>Recent activity</Trans>
        </h2>
        <button
          type="button"
          className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
        >
          <Trans>View all</Trans>
        </button>
      </div>
      <div className="border border-border bg-card">
        {placeholderActivity.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 border-border border-b p-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-foreground">
                <RiExchangeFundsLine className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{item.title}</p>
                <p className="text-muted-foreground text-xs">{item.meta}</p>
              </div>
            </div>
            <p className="shrink-0 font-heading font-semibold text-xs tracking-tight">
              {item.amount}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function VoucherListSection() {
  return (
    <section aria-labelledby="my-vouchers-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="my-vouchers-title" className="font-heading font-semibold text-base">
          <Trans>My vouchers</Trans>
        </h2>
        <button
          type="button"
          className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
        >
          <Trans>View all</Trans>
        </button>
      </div>
      <div className="space-y-2">
        {placeholderVouchers.map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex w-full items-center justify-between gap-3 border border-border bg-card p-3 text-left transition-colors active:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-foreground [&_svg]:size-4">
                <RiCoupon3Line />
              </span>
              <span className="block truncate font-medium text-sm">{item.name}</span>
            </span>
            <span className="shrink-0 font-heading font-semibold text-xs tracking-tight">
              {item.balance}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PoolListSection() {
  return (
    <section aria-labelledby="my-pools-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="my-pools-title" className="font-heading font-semibold text-base">
          <Trans>My pools</Trans>
        </h2>
        <button
          type="button"
          className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
        >
          <Trans>View all</Trans>
        </button>
      </div>
      <div className="space-y-2">
        {placeholderPools.map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex w-full items-center justify-between gap-3 border border-border bg-card p-3 text-left transition-colors active:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-foreground">
                <RiGroupLine className="size-4" aria-hidden="true" />
              </span>
              <span className="block truncate font-medium text-sm">{item.name}</span>
            </span>
            <RiArrowRightSLine
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
