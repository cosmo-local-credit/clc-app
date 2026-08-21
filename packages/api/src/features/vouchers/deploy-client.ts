import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { isTerminalOtxFailure } from "@clc/core/lib/otx";

import type { HttpClient } from "../../client/http-client";
import type { OtxTrackResult, OtxTrackingOutcome } from "../auth/client";

/**
 * The one transaction a voucher deploy is. A pool fans out into a registry, a
 * limiter, a fee policy and sometimes a quoter before the proxy lands; the token
 * factory deploys in a single call, so there is nothing to sequence and the
 * terminal type is the only type.
 *
 * `TOKEN_PROXY_DEPLOY`, from clc-core's `store.TOKEN_PROXY_DEPLOY` — the value
 * `internal/worker/erc20.go` passes to `insertTrackedTx`. Not `TOKEN_DEPLOY`:
 * that is the River *job* kind (`DeployTokenArgs.Kind()`), which never reaches
 * `/otx/track` and matching on it leaves a successful deploy pending forever.
 */
const VOUCHER_TERMINAL_OTX_TYPE = "TOKEN_PROXY_DEPLOY";

export function createVoucherDeployClient(http: HttpClient) {
  return {
    async deployVoucher(payload: VoucherDeployPayload): Promise<{ trackingId: string }> {
      const result = await http.request<{ trackingId?: unknown }>("/api/v2/contracts/token", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (typeof result.trackingId !== "string" || !result.trackingId) {
        throw new Error("Voucher deployment response did not include a tracking ID.");
      }
      return { trackingId: result.trackingId };
    },
  };
}

/**
 * Whether the deploy has landed, reverted, or is still in the network.
 *
 * Replaced records are filtered out the way the pool tracker does it: a gas bump
 * leaves the superseded attempt in the response, and reading its status would
 * report a failure for a transaction that was replaced rather than lost. The
 * unfiltered list is the fallback, because every record being replaced would
 * otherwise read as "nothing sent".
 */
export function getVoucherTrackingOutcome(result: OtxTrackResult | undefined): OtxTrackingOutcome {
  const allRecords = result?.otx ?? [];
  const currentRecords = allRecords.filter((record) => !record.replaced);
  const records = currentRecords.length > 0 ? currentRecords : allRecords;

  const failed = records.find((record) => isTerminalOtxFailure(record.status ?? ""));
  if (failed) {
    return { kind: "error", error: `Transaction failed on-chain (${failed.status}).` };
  }

  const deploy = [...records]
    .reverse()
    .find((record) => record.otxType === VOUCHER_TERMINAL_OTX_TYPE);
  return deploy?.status === "SUCCESS" ? { kind: "success", otx: deploy } : { kind: "pending" };
}
