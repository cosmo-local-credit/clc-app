import { createDeploymentsClient } from "@clc/api/features/deployments/client";

import { clcHttp } from "./http";

export const deploymentsClient = createDeploymentsClient(clcHttp);
