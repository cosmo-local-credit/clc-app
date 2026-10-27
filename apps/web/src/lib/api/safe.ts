import { createSafeClient } from "@clc/api/features/safe/client";

import { clcHttp } from "./http";

export const safeClient = createSafeClient(clcHttp);
