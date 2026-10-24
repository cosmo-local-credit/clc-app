import { createWantsClient } from "@clc/api/features/wants/client";
import { clcHttp } from "./http";

export const wantsClient = createWantsClient(clcHttp);
