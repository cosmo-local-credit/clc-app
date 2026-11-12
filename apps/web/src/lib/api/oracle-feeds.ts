import { createOracleFeedsClient } from "@clc/api/features/oracle-feeds/client";
import { clcHttp } from "./http";

export const oracleFeedsClient = createOracleFeedsClient(clcHttp);
