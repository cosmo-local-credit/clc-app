import { createAccountRetirementClient } from "@clc/api/features/account-retirement/client";
import { clcHttp } from "./http";

export const accountRetirementClient = createAccountRetirementClient(clcHttp);
