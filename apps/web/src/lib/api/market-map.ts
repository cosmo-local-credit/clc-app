import { createMarketMapClient } from "@clc/api/features/market-map/client";
import { clcHttp } from "./http";

export const marketMapClient = createMarketMapClient(clcHttp);
