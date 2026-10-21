import { getTrackingOutcome, pollTrackingCompletion } from "@clc/api/features/auth/client";
import type { RelayerClient } from "@clc/api/features/relayer/client";

export class OwnershipSettlementError extends Error {
  constructor(
    public trackingId: string,
    public terminal: boolean,
    message: string,
  ) {
    super(message);
  }
}

export async function waitForOwnershipRelay(client: RelayerClient, trackingId: string) {
  let terminal = false;
  try {
    const otx = await pollTrackingCompletion(
      async () => {
        const result = (await client.trackRelay(trackingId)).result;
        terminal = getTrackingOutcome(result).kind === "error";
        return result;
      },
      { pendingWhileNotFound: true },
    );
    return { trackingId, txHash: otx.txHash };
  } catch (error) {
    throw new OwnershipSettlementError(
      trackingId,
      terminal,
      terminal
        ? error instanceof Error
          ? error.message
          : "The transaction failed."
        : `Settlement is still uncertain. Check submission ${trackingId} before trying another transfer.`,
    );
  }
}
