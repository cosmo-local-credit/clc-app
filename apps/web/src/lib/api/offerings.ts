import { createOfferingsClient } from "@clc/api/features/offerings/client";

import { clcHttp } from "./http";

export const offeringsClient = createOfferingsClient(clcHttp, { cache: "no-store" });
