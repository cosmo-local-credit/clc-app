import { createFlowExit } from "#/lib/navigation/flow-exit";

/**
 * Voucher creation exits twice: the form lands on the receipt, then the receipt
 * lands on whatever the issuer picks next — so the latch has to be released.
 */
const voucherCreateExit = createFlowExit({ reentrant: true });

export const beginVoucherCreateHistory = voucherCreateExit.noteRoot;
export const resetVoucherCreateHistory = voucherCreateExit.reset;
export const exitVoucherCreateHistory = voucherCreateExit.exit;
