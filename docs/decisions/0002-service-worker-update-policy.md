# ADR 0002: Service Worker Update And Cache Policy

- Status: Accepted
- Date: 2026-06-11

## Context

CLC registers a module service worker at the stable `/sw.js` URL. The worker
uses `skipWaiting: true` and `clientsClaim: true`, but those settings only
control activation after a browser discovers a changed worker. They do not
define how frequently the browser checks for changes or how `/sw.js` is cached
by the deployment platform.

A stale worker is especially risky for Web Push because it can keep processing
push events after the user has stopped opening the app regularly.

## Decision

1. Keep the service worker URL stable at `/sw.js`. Do not add a release query
   string or content hash to the registration URL.
2. Register with `updateViaCache: "none"` so update checks do not reuse the HTTP
   cache for the worker script or its imported modules.
3. Treat production registration on every app load as the initial update check.
4. For a long-running installed PWA, call `ServiceWorkerRegistration.update()`
   when the app becomes visible or focused and at least one hour has passed
   since the previous check.
5. Serve `/sw.js` with
   `Cache-Control: no-cache, max-age=0, must-revalidate`.
6. Keep immediate activation through Serwist `skipWaiting: true` and
   `clientsClaim: true`. Page-worker protocol negotiation remains responsible
   for preventing incompatible messages from being interpreted.
7. Update-check failures are diagnostic only. Offline or temporary network
   failure must not break app startup or notification handling.

## Consequences

- Deployments can replace `/sw.js` without changing its registration identity.
- Returning users check the network for a newer worker during app startup.
- Long-running Home Screen PWAs periodically discover deployments without
  requiring a full app restart.
- The deployment platform must preserve the `_headers` rule in the published
  output and return the expected `Cache-Control` header.
- Production verification is still required; repository configuration cannot
  prove the CDN actually serves the declared headers.

## Remaining Verification

- Build the Cloudflare Pages output and confirm `_headers` is copied beside
  `sw.js`.
- After deployment, inspect `GET /sw.js` and confirm the cache policy.
- Deploy a worker version change and confirm an already installed PWA activates
  it without breaking push delivery or page-worker compatibility.
- Confirm any non-Cloudflare deployment applies an equivalent header rule.

## Related

- [ADR 0001](0001-web-push-worker-lifecycle-and-stages.md)
- [Task 1 PRD](../../my-tasks/task1.md)
