import { Trans, useLingui } from "@lingui/react/macro";
import type * as React from "react";
import { RiCheckLine } from "react-icons/ri";

import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Button } from "#/components/ui/button";
import { TokenLogo } from "#/components/wallet";
import type { WalletToken } from "#/components/wallet/wallet-data";
import { cn } from "#/lib/utils";

export function TokenPickerSheet({
  open,
  onOpenChange,
  tokens,
  selectedId,
  onSelect,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: WalletToken[];
  selectedId?: string;
  onSelect: (token: WalletToken) => void;
  finalFocus?: React.ComponentProps<typeof SheetContent>["finalFocus"];
}) {
  const { t } = useLingui();
  function handleSelect(token: WalletToken) {
    onSelect(token);
    onOpenChange(false);
  }
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent finalFocus={finalFocus} className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Select a token</Trans>
            </SheetTitle>
          </SheetHeader>
          {/* Replace this static set with a TanStack Query + TanStack Virtual powered infinite token list when backend pagination is wired. */}
          <div className="flex-1 overflow-y-auto px-3">
            {tokens.map((token, index, list) => {
              const active = token.id === selectedId;
              return (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => handleSelect(token)}
                  className={cn(
                    "flex w-full items-center gap-3 px-2 py-3 text-start",
                    index < list.length - 1 && "border-b border-border",
                  )}
                >
                  <TokenLogo token={token} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{token.symbol}</p>
                    <p className="truncate text-muted-foreground text-xs">{token.name}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold text-sm tabular-nums">{token.amount}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">{token.fiat}</p>
                  </div>
                  {active ? (
                    <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <SheetFooter>
            <Button
              variant="link"
              tap
              className="w-full text-foreground"
              onClick={() => onOpenChange(false)}
            >
              {t`Cancel`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
