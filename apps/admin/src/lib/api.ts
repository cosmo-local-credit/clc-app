import { createClcApi } from "@clc/api/client/create-clc-api";

/**
 * The app's single clc-core client.
 *
 * Env is read here, not in @clc/api: the package must stay free of build-tool
 * globals so it can be configured differently per app and stubbed in tests.
 * A production build with no VITE_API_URL passes an empty base URL, which
 * createClcApi rejects at startup rather than failing one request at a time.
 *
 * `fetch` is deliberately not passed. The client resolves the platform `fetch`
 * per request, so a test double or mock service worker installed after this
 * module loads is still honoured — passing `globalThis.fetch` here would pin
 * the real implementation at import time and silently bypass them.
 */
const DEV_FALLBACK_BASE_URL = "http://localhost:5003";

export const clcApi = createClcApi({
  baseUrl: import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? DEV_FALLBACK_BASE_URL : ""),
});
