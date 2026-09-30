import type { ReviewAccess, ReviewPage } from "@clc/core/features/reviews/logic";
import { clcHttp } from "#/lib/api/http";

const path = (address: string) => `/api/v2/vouchers/${encodeURIComponent(address)}/reviews`;

export function getReviews(address: string, stars?: number, before?: number, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (stars) query.set("stars", String(stars));
  if (before) query.set("before", String(before));
  return clcHttp.request<ReviewPage>(`${path(address)}?${query}`, { signal });
}

export function getReviewAccess(address: string, signal?: AbortSignal) {
  return clcHttp.request<ReviewAccess>(`${path(address)}/me`, { signal, cache: "no-store" });
}

export function saveReview(address: string, stars: number, comment: string) {
  return clcHttp.request(`${path(address)}/me`, {
    method: "PUT",
    body: JSON.stringify({ stars, comment }),
  });
}

export function saveReviewReply(address: string, id: number, reply: string) {
  return clcHttp.request(`${path(address)}/${id}/reply`, {
    method: "PUT",
    body: JSON.stringify({ reply }),
  });
}

export function flagReview(address: string, id: number, reason: string) {
  return clcHttp.request(`${path(address)}/${id}/flag`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
