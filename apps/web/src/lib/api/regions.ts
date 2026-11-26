import { createRegionsClient } from "@clc/api/features/regions/client";

import { clcHttp } from "./http";

export const regionsClient = createRegionsClient(clcHttp);
