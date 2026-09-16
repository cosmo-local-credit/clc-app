import { createAuthClient } from "@clc/api/features/auth/client";

import { clcHttp } from "./http";

export const authClient = createAuthClient(clcHttp);
