import { createIdentityClient } from "@clc/api/features/identity/client";

import { clcHttp } from "./http";

export const identityClient = createIdentityClient(clcHttp);
