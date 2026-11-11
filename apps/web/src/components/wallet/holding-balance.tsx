import { formatCompactUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { useLingui } from "@lingui/react/macro";

import type { WalletToken } from "./wallet-data";

/**
 * A wallet row's balance: what the holding is worth in its own unit, with the
 * token amount beneath. Vouchers state different units and there is no rate
 * between them, so each row keeps its own unit and nothing is summed. A
 * holding with no stated rate shows its token amount alone.
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
  const figure = value && token.unitValue ? `${value} ${token.unitValue.unit}` : token.amount;

  return (
    <div className="shrink-0 text-end">
      <p className="text-sm">
        <span dir="ltr" className="font-heading font-semibold tracking-tight">
          {figure}
        </span>
      </p>
      {value ? (
        <p className="text-muted-foreground text-2xs">
          <span dir="ltr" className="font-mono">
            {token.amount} {token.symbol}
          </span>
        </p>
      ) : null}
    </div>
  );
}
