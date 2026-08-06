import { apiFetch, BackendApiError } from "#/features/auth/api/client";

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

export async function getSendShareEligibility(address: string): Promise<boolean> {
  const result = await apiFetch<{ eligible: boolean }>(
    `/api/v2/users/me/shares/eligibility/${address}`,
    { method: "GET", cache: "no-store" },
  );
  return result.eligible;
}

export async function getSendShare(txHash: string): Promise<SendShareAttachment | null> {
  try {
    return await apiFetch<SendShareAttachment>(`/api/v2/users/me/shares/${txHash}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) return null;
    throw error;
  }
}
