import { createMarketClient } from "@clc/api/features/market/client";

import { clcHttp } from "./http";

export const marketClient = createMarketClient(clcHttp, { cache: "no-store" });
