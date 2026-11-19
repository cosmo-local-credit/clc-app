import {
  createAdminMessagingClient,
  createMessagingClient,
} from "@clc/api/features/messaging/client";

import { clcHttp } from "./http";

export const messagingClient = createMessagingClient(clcHttp);
export const adminMessagingClient = createAdminMessagingClient(clcHttp);
