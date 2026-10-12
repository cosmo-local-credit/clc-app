import { createMarketplaceClient } from "@clc/api/features/marketplace/client";
import { clcHttp } from "./http";

export const marketplaceClient = createMarketplaceClient(clcHttp);
