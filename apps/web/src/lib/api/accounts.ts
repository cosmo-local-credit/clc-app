import { createAccountsClient } from "@clc/api/features/accounts/client";

import { clcHttp } from "./http";

export const accountsClient = createAccountsClient(clcHttp);
