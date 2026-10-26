import { createRetirementClient } from "@clc/api/features/retirement/client";
import { clcHttp } from "./http";

export const retirementClient = createRetirementClient(clcHttp);
