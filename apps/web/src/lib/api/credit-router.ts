import { createCreditRouterClient } from "@clc/api/features/credit-router/client";
import { clcHttp } from "./http";

export const creditRouterClient = createCreditRouterClient(clcHttp);
