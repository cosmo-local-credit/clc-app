import { createRecipientsClient } from "@clc/api/features/recipients/client";
import { clcHttp } from "./http";

export const recipientsClient = createRecipientsClient(clcHttp);
export const recipientQueryKey = ["clc", "recipients"] as const;
