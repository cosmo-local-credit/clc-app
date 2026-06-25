import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiBankLine,
  RiCloseLine,
  RiDownloadLine,
  RiSmartphoneLine,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { BackChevron } from "#/components/wallet/wallet-kit";

type MethodState = "ready" | "soon";

type TopUpMethod = {
  id: string;
  name: string;
  desc: string;
  icon: ReactNode;
  state: MethodState;
};

const METHODS: TopUpMethod[] = [
  {
    id: "mpesa",
    name: "MPESA",
    desc: "+254 712 345 678",
    icon: <RiSmartphoneLine className="size-4" aria-hidden="true" />,
    state: "ready",
  },
  {
    id: "card",
    name: "Debit / Credit card",
    desc: "Visa, Mastercard",
    icon: <RiBankCardLine className="size-4" aria-hidden="true" />,
    state: "soon",
  },
  {
    id: "bank",
    name: "Bank transfer",
    desc: "Direct deposit",
    icon: <RiBankLine className="size-4" aria-hidden="true" />,
    state: "soon",
  },
  {
    id: "crypto",
    name: "Tokens",
    desc: "From another wallet or exchange",
    icon: <RiDownloadLine className="size-4" aria-hidden="true" />,
    state: "ready",
  },
];

export function TopUpPage() {
  const { t } = useLingui();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Top up`} to="/" />

      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Add money</Trans>
      </h1>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        <Trans>Buy USDC with local money or receive crypto.</Trans>
      </p>

      <div className="border border-border bg-card">
        {METHODS.map((method, index, list) => {
          const disabled = method.state === "soon";
          return (
            <button
              key={method.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (method.id === "mpesa") setSheetOpen(true);
              }}
              className={[
                "flex h-14 w-full items-center gap-3 px-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
                disabled ? "cursor-default opacity-55" : "active:bg-muted",
              ].join(" ")}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary"
                aria-hidden="true"
              >
                {method.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{method.name}</p>
                <p className="truncate text-muted-foreground text-xs">{method.desc}</p>
              </div>
              {disabled ? (
                <span className="shrink-0 border border-border px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  <Trans>Soon</Trans>
                </span>
              ) : (
                <RiArrowRightSLine
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <MpesaSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function MpesaSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                  <RiSmartphoneLine className="size-3.5" aria-hidden="true" />
                </span>
                <div>
                  <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
                    <Trans>MPESA</Trans>
                  </SheetTitle>
                  <p className="font-semibold text-primary text-xs">+254 712 345 678</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t`Close`}
                className="flex size-8 items-center justify-center border border-border bg-card text-muted-foreground"
              >
                <RiCloseLine className="size-4" aria-hidden="true" />
              </button>
            </div>
          </SheetHeader>

          <div className="px-6 pt-1 pb-2">
            <label
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
              htmlFor="topup-amount"
            >
              <Trans>Amount (KSh)</Trans>
            </label>
            <div className="flex items-center border border-border bg-card px-3.5">
              <span className="mr-1.5 text-xs font-semibold text-muted-foreground">KSh</span>
              <Input
                id="topup-amount"
                type="text"
                inputMode="decimal"
                defaultValue="500"
                className="h-auto min-h-9 border-0 bg-transparent px-0 font-heading text-2xl font-semibold tracking-tight shadow-none focus-visible:border-0"
              />
            </div>
          </div>

          <SheetFooter>
            <Button className="h-11 w-full">
              <Trans>Continue</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
