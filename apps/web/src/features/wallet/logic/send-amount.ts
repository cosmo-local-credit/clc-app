/** Keep only digits and a single decimal point, capped at 2 fraction digits. */
export function sanitizeSendAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

/**
 * Whether the typed amount is a positive payment, and whether it is more than
 * the voucher holds. The raw balance decides when it is known; the displayed
 * one stands in only while it is not.
 */
export function checkSendAmount({
  amount,
  amountRaw,
  balanceRaw,
  displayBalance,
}: {
  amount: string;
  /** The amount in base units, or null when it does not parse. */
  amountRaw: string | null;
  balanceRaw: string | null;
  /** The balance as shown ("1,234.50"), when a voucher is selected. */
  displayBalance: string | undefined;
}): { valid: boolean; exceedsBalance: boolean } {
  const value = Number(amount);
  const valid =
    amount.trim() !== "" &&
    Number.isFinite(value) &&
    value > 0 &&
    amountRaw !== null &&
    BigInt(amountRaw) > 0n;
  const exceedsBalance =
    valid && amountRaw !== null && balanceRaw !== null
      ? BigInt(amountRaw) > BigInt(balanceRaw)
      : displayBalance !== undefined
        ? value > Number(displayBalance.replace(/,/g, ""))
        : false;
  return { valid, exceedsBalance };
}

/**
 * The label and pool a link handed Send belong to the recipient it named. Once
 * the person pays someone else, the new address is not shown under the old
 * name, and the receipt does not send them "back" to a pool they did not pay.
 */
export function seededRecipientContext(
  recipient: { address: `0x${string}`; name: string | null } | null,
  seed: { recipient?: string; recipientLabel?: string; returnPool?: string },
): { recipientLabel: string | undefined; returnPool: string | undefined } {
  const seeded = recipient !== null && recipient.address === seed.recipient;
  return {
    recipientLabel: recipient?.name ?? (seeded ? seed.recipientLabel : undefined),
    returnPool: seeded ? seed.returnPool : undefined,
  };
}
