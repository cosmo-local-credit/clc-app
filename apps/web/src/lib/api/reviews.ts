import { createReviewsClient } from "@clc/api/features/reviews/client";

import { clcHttp } from "./http";

export const reviewsClient = createReviewsClient(clcHttp);
