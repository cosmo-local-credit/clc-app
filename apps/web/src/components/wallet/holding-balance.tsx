import { formatCompactUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { useLingui } from "@lingui/react/macro";

import type { WalletToken } from "./wallet-data";

/**
 * A wallet row's balance: what the holding is worth in its own unit, with the
 * token amount beneath. Vouchers state different units and there is no rate
 * between them, so each row keeps its own unit and nothing is summed. A
 * holding with no stated rate shows its token amount alone.
 *
 * Each figure keeps its locked font: the value, like every KES or USD amount,
 * is mono; the token amount, as a row balance, is the heading font.
 */
export function HoldingBalance({
  token,
}: {
  token: Pick<WalletToken, "amount" | "symbol" | "unitValue">;
}) {
  const { i18n } = useLingui();
  const value = token.unitValue
    ? formatCompactUnitOfAccountDisplayValue(
        token.unitValue.value,
        i18n.locales?.[0] ?? i18n.locale,
      )
    : null;

  return (
    <div className="shrink-0 text-end">
      {value && token.unitValue ? (
        <p className="text-sm">
          <span dir="ltr" className="font-mono font-semibold">
            {value} {token.unitValue.unit}
          </span>
        </p>
      ) : null}
      <p className={value ? "text-muted-foreground text-2xs" : "text-sm"}>
        <span dir="ltr" className="font-heading font-semibold tracking-tight">
          {token.amount}
          {value ? ` ${token.symbol}` : null}
        </span>
      </p>
    </div>
  );
}
