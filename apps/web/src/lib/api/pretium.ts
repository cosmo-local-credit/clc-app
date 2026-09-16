import { createPretiumClient } from "@clc/api/features/pretium/client";

import { clcHttp } from "./http";

export const pretiumClient = createPretiumClient(clcHttp);
