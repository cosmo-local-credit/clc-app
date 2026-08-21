import { BackendApiError } from "@clc/api/client/errors";

import { clcHttp } from "#/lib/api/http";

type SendShareLocation = {
  locationName: string;
  lat: number;
  lng: number;
};

export type SendShareAttachment = {
  id: number;
  trackingId: string;
  txHash: string;
  permission: number;
  note: string;
  createdAt: string;
  sharedBy: {
    name: string;
    email?: string;
    phone?: string;
    location?: SendShareLocation;
  };
};

export type CreateSendShareInput = {
  permission: number;
  note?: string;
};

export async function getSendShareEligibility(address: string): Promise<boolean> {
  const result = await clcHttp.request<{ eligible: boolean }>(
    `/api/v2/users/me/shares/eligibility/${encodeURIComponent(address)}`,
    { method: "GET", cache: "no-store" },
  );
  return result.eligible;
}

export function createSendShare(
  txHash: string,
  input: CreateSendShareInput,
): Promise<SendShareAttachment> {
  return clcHttp.request<SendShareAttachment>(
    `/api/v2/users/me/shares/${encodeURIComponent(txHash)}`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getSendShare(txHash: string): Promise<SendShareAttachment | null> {
  try {
    return await clcHttp.request<SendShareAttachment>(`/api/v2/users/me/shares/${txHash}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) return null;
    throw error;
  }
}
