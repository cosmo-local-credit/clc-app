import { createHttpClient } from "@clc/api/client/http-client";
import { createAdminMessagingClient } from "@clc/api/features/messaging/client";
import { API_ORIGIN } from "#/lib/api";

/**
 * The helpdesk and abuse-report client, on the same origin as `clcApi`.
 *
 * Every request it makes is `no-store`, so the console never reads its own
 * write back from a publicly cached response.
 */
export const adminMessaging = createAdminMessagingClient(createHttpClient({ baseUrl: API_ORIGIN }));
