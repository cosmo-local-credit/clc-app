import { Trans, useLingui } from "@lingui/react/macro";
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
import { TokenLogo } from "#/components/wallet";
import type { WalletToken } from "#/components/wallet/wallet-data";
import { cn } from "#/lib/utils";

export function TokenPickerSheet({
  open,
  onOpenChange,
  tokens,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: WalletToken[];
  selectedId?: string;
  onSelect: (token: WalletToken) => void;
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
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="font-heading text-base font-semibold">
              <Trans>Select a token</Trans>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-2">
            {tokens.map((token, index, list) => {
              const active = token.id === selectedId;
              return (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => handleSelect(token)}
                  className={cn(
                    "flex w-full items-center gap-3 px-2 py-3 text-left",
                    index < list.length - 1 && "border-b border-border",
                  )}
                >
                  <TokenLogo token={token} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm tracking-tight">{token.symbol}</p>
                    <p className="truncate text-muted-foreground text-xs">{token.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-semibold text-sm tracking-tight">
                      {token.amount}
                    </p>
                    <p className="font-mono text-muted-foreground text-[0.6875rem]">{token.fiat}</p>
                  </div>
                  {active ? (
                    <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <SheetFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 w-full font-medium text-foreground text-sm hover:underline"
            >
              {t`Cancel`}
            </button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
