const NON_TERMINAL_OTX_STATUSES = new Set(["", "PENDING", "IN_NETWORK"]);

export function isTerminalOtxFailure(status: string): boolean {
  return status !== "SUCCESS" && !NON_TERMINAL_OTX_STATUSES.has(status);
}
