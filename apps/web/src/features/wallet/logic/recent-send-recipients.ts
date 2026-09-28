const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** How many distinct people to offer under the send field. */
const RECENT_SEND_RECIPIENT_LIMIT = 5;

export type SendActivityRow = {
  direction: "IN" | "OUT";
  success: boolean;
  recipientAddress: string;
  dateBlock: string;
};

/**
 * People this wallet has successfully sent to, newest first.
 *
 * Incoming transfers and failed sends are not recipients to pay again. A
 * repeat of the same address keeps the newest row. Sending to yourself is
 * left out.
 */
export function recentSendRecipients(
  transfers: readonly SendActivityRow[],
  viewer: string | undefined,
  limit = RECENT_SEND_RECIPIENT_LIMIT,
): `0x${string}`[] {
  const viewerKey = viewer?.toLowerCase();
  const ranked = transfers
    .map((transfer, index) => ({ transfer, index }))
    .filter(({ transfer }) => {
      if (!transfer.success || transfer.direction !== "OUT") return false;
      if (!HEX_ADDRESS.test(transfer.recipientAddress)) return false;
      if (viewerKey !== undefined && transfer.recipientAddress.toLowerCase() === viewerKey) {
        return false;
      }
      return true;
    })
    .sort((a, b) => compareRecent(a, b));

  const seen = new Set<string>();
  const recipients: `0x${string}`[] = [];
  for (const { transfer } of ranked) {
    const key = transfer.recipientAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(transfer.recipientAddress as `0x${string}`);
    if (recipients.length >= limit) break;
  }
  return recipients;
}

function compareRecent(
  a: { transfer: SendActivityRow; index: number },
  b: { transfer: SendActivityRow; index: number },
): number {
  const aTime = Date.parse(a.transfer.dateBlock);
  const bTime = Date.parse(b.transfer.dateBlock);
  const aOk = Number.isFinite(aTime);
  const bOk = Number.isFinite(bTime);
  if (aOk && bOk && aTime !== bTime) return bTime - aTime;
  if (aOk !== bOk) return aOk ? -1 : 1;
  return a.index - b.index;
}
