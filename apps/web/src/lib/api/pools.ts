import { createPoolsClient } from "@clc/api/features/pools/client";

import { clcHttp } from "./http";

export const poolsClient = createPoolsClient(clcHttp);
