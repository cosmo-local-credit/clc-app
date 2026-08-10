import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";

import { apiFetch } from "#/features/auth/api/client";
import {
  type HexAddress,
  normalizeHex,
  normalizeStringArray,
  normalizeText,
} from "#/lib/api-normalize";

export type VoucherDeploymentContract = {
  address: HexAddress | null;
  name: string;
  symbol: string;
  status: string;
};

type BackendDeploymentContract = Partial<{
  address: string | null;
  name: string;
  symbol: string;
  status: string;
}>;

type BackendDeploymentResult = {
  type?: unknown;
  contract?: BackendDeploymentContract | null;
};

export async function deployVoucher(
  payload: VoucherDeployPayload,
): Promise<{ trackingId: string }> {
  const result = await apiFetch<{ trackingId?: unknown }>("/api/v2/contracts/token", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (typeof result.trackingId !== "string" || !result.trackingId) {
    throw new Error("Voucher deployment response did not include a tracking ID.");
  }
  return { trackingId: result.trackingId };
}

export async function getVoucherTags(signal?: AbortSignal): Promise<string[]> {
  const result = await apiFetch<{ tags?: unknown }>("/api/v2/token-tags", {
    method: "GET",
    cache: "no-store",
    signal,
  });
  return normalizeStringArray(result.tags);
}

export async function getVoucherDeploymentContract(
  trackingId: string,
  signal?: AbortSignal,
): Promise<VoucherDeploymentContract | null> {
  const result = await apiFetch<BackendDeploymentResult | null>(
    `/api/v2/otx/track/${encodeURIComponent(trackingId)}/contract`,
    { method: "GET", cache: "no-store", signal },
  );
  if (!result) return null;
  if (result.type !== "TOKEN") {
    throw new Error("Tracking ID does not belong to a voucher deployment.");
  }

  const contract = result.contract;
  const name = normalizeText(contract?.name);
  const symbol = normalizeText(contract?.symbol);
  const status = normalizeText(contract?.status);
  if (!contract || !name || !symbol || !status) {
    throw new Error("Voucher deployment response was incomplete.");
  }

  return {
    address: normalizeHex(contract.address),
    name,
    symbol,
    status,
  };
}
