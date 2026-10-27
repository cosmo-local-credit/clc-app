import type { ActivityLeg } from "@clc/api/features/accounts/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans } from "@lingui/react/macro";

import { SignedAmount } from "#/components/wallet";
import { formatTransferUnitValue } from "#/features/wallet/logic/transfer-display";

export type SwapDisplayLeg = ActivityLeg;

export function SwapActivityTitle({ symbols }: { symbols: readonly [string, string] }) {
  return (
    <Trans>
      Swapped {symbols[0]} for {symbols[1]}
    </Trans>
  );
}

export function SwapActivityAmounts({
  outgoing,
  incoming,
  protocolFee,
  locale,
  incomingFirst = false,
}: {
  outgoing: SwapDisplayLeg;
  incoming: SwapDisplayLeg;
  protocolFee?: SwapDisplayLeg;
  locale: string;
  incomingFirst?: boolean;
}) {
  const incomingAmount = (
    <SignedAmount
      direction="in"
      amount={formatActivityLegAmount(incoming, locale)}
      className="flex justify-end"
    />
  );
  const outgoingAmount = (
    <SignedAmount
      direction="out"
      amount={formatActivityLegAmount(outgoing, locale)}
      className="flex justify-end"
    />
  );
  return (
    <>
      {incomingFirst ? incomingAmount : outgoingAmount}
      {incomingFirst ? outgoingAmount : incomingAmount}
      {protocolFee ? (
        <span className="block font-mono text-muted-foreground text-2xs tabular-nums">
          <Trans>Protocol fee</Trans> {formatActivityLegAmount(protocolFee, locale)}
        </span>
      ) : null}
    </>
  );
}

export function formatActivityLegAmount(leg: SwapDisplayLeg, locale: string): string {
  const tokenAmount = `${formatTokenAmount(leg.amount, leg.tokenDecimals)} ${leg.tokenSymbol}`;
  const unitValue = formatTransferUnitValue(leg.uoaValue, leg.uoa, locale);
  return `${tokenAmount}${unitValue ? ` (${unitValue})` : ""}`;
}
