import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { isTerminalOtxFailure } from "@clc/core/lib/otx";

import {
  apiFetch,
  type OtxRecord,
  type OtxTrackingOutcome,
  type OtxTrackResult,
} from "#/features/auth/api/client";

const POOL_TERMINAL_OTX_TYPE = "POOL_PROXY_DEPLOY";

export async function deployPool(payload: PoolDeployPayload): Promise<{ trackingId: string }> {
  const result = await apiFetch<{ trackingId?: unknown }>("/api/v2/contracts/pool", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (typeof result.trackingId !== "string" || !result.trackingId) {
    throw new Error("Pool deployment response did not include a tracking ID.");
  }
  return { trackingId: result.trackingId };
}

export function getPoolTrackingOutcome(result: OtxTrackResult | undefined): OtxTrackingOutcome {
  const allRecords = result?.otx ?? [];
  const currentRecords = allRecords.filter((record) => !record.replaced);
  const records = currentRecords.length > 0 ? currentRecords : allRecords;

  const failed = records.find((record) => isTerminalOtxFailure(record.status ?? ""));
  if (failed) {
    return { kind: "error", error: `Transaction failed on-chain (${failed.status}).` };
  }

  const pool = [...records].reverse().find((record) => record.otxType === POOL_TERMINAL_OTX_TYPE);
  return pool?.status === "SUCCESS" ? { kind: "success", otx: pool } : { kind: "pending" };
}

export function getPoolDeploymentRecords(result: OtxTrackResult | undefined): OtxRecord[] {
  const records = result?.otx ?? [];
  const current = records.filter((record) => !record.replaced);
  return current.length > 0 ? current : records;
}
