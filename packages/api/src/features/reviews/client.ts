import type { ReviewAccess, ReviewPage, ReviewTarget } from "@clc/core/features/reviews/logic";

import type { HttpClient } from "../../client/http-client";

export type ReviewListParams = {
  stars?: number;
  before?: number;
};

function reviewPath(target: ReviewTarget): string {
  const resource = target.kind === "voucher" ? "vouchers" : "pools";
  return `/api/v2/${resource}/${encodeURIComponent(target.address)}/reviews`;
}

export function createReviewsClient(http: HttpClient) {
  return {
    async list(target: ReviewTarget, params: ReviewListParams = {}, signal?: AbortSignal) {
      const query = new URLSearchParams();
      if (params.stars) query.set("stars", String(params.stars));
      if (params.before) query.set("before", String(params.before));
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      return http.request<ReviewPage>(`${reviewPath(target)}${suffix}`, {
        signal,
        cache: "no-store",
      });
    },

    access(target: ReviewTarget, signal?: AbortSignal) {
      return http.request<ReviewAccess>(`${reviewPath(target)}/me`, {
        signal,
        cache: "no-store",
      });
    },

    save(target: ReviewTarget, stars: number, comment: string) {
      return http.request<{ saved: boolean }>(`${reviewPath(target)}/me`, {
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ stars, comment }),
      });
    },

    reply(target: ReviewTarget, id: number, reply: string) {
      return http.request<{ saved: boolean }>(`${reviewPath(target)}/${id}/reply`, {
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ reply }),
      });
    },

    flag(target: ReviewTarget, id: number, reason: string) {
      return http.request<{ saved: boolean }>(`${reviewPath(target)}/${id}/flag`, {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ reason }),
      });
    },
  };
}

export type ReviewsClient = ReturnType<typeof createReviewsClient>;
