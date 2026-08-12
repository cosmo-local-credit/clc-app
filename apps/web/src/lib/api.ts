import { createClcApi } from "@clc/api/client/create-clc-api";

/**
 * The app's single clc-core client.
 *
 * Env is read here, not in @clc/api: the package must stay free of build-tool
 * globals so it can be configured differently per app and stubbed in tests.
 *
 * The fallback is unconditional, matching what `lib/backend-config.ts` did before
 * this app moved onto @clc/api. Making it dev-only would throw at module load in
 * a production build with no VITE_API_URL — a blank screen where this app
 * previously rendered. apps/admin is new and can be stricter; this app cannot
 * change behaviour on the way through a refactor.
 *
 * `fetch` is deliberately not passed. The client resolves the platform `fetch`
 * per request, so a test double or mock service worker installed after this
 * module loads is still honoured — passing `globalThis.fetch` here would pin
 * the real implementation at import time and silently bypass them.
 */
const FALLBACK_BASE_URL = "http://localhost:5003";

export const clcApi = createClcApi({
  baseUrl: import.meta.env.VITE_API_URL ?? FALLBACK_BASE_URL,
});
