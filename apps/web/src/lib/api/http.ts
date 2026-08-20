import { createHttpClient } from "@clc/api/client/http-client";

/**
 * The mobile app's single clc-core transport.
 *
 * Env is read here, not in @clc/api: the package must stay free of build-tool
 * globals so it can be configured differently per app and stubbed in tests.
 *
 * The fallback is unconditional, matching the app's existing behaviour. Fetch
 * remains late-bound inside the transport so test doubles or a mock service
 * worker installed after this module loads are still honoured.
 */
const FALLBACK_BASE_URL = "http://localhost:5003";

export const clcHttp = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? FALLBACK_BASE_URL,
});
