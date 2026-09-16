import { createReportsClient } from "@clc/api/features/reports/client";

import { clcHttp } from "./http";

export const reportsClient = createReportsClient(clcHttp);
