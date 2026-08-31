# Troubleshooting

## Notification enrollment fails with HTTP 404

**Symptom:** Tapping **Enable notifications** grants browser permission, then the
settings screen reports `Notifications could not be enabled` and
`Request failed with 404`.

**Cause:** The notification client fetches [[VAPID]] material from
`/api/notifications/vapid-public-key`. It prefers `VITE_WEBPUSH_BASE_URL`, but
falls back to `VITE_API_URL`. The Cloudflare Pages configuration does not define
the Web Push override, so deployed builds call:

```text
https://staging.cosmolocal.credit/api/notifications/vapid-public-key
```

An older staging API does not expose `/api/notifications/*` and returns 404.
Local testing worked because the explicitly dev-only `dev/webpush` process
implemented that contract at `VITE_WEBPUSH_BASE_URL=http://localhost:8787`; it
was never evidence that clc-core exposed the same routes.

**Verification:**

```sh
curl -i https://staging.cosmolocal.credit/api/notifications/vapid-public-key
curl -i 'https://staging.cosmolocal.credit/api/v2/vouchers?perPage=1'
```

The first request returns 404 while the known API route returns 200. Enrollment
fetches the VAPID key before calling `pushManager.subscribe()`, so the failure is
at the frontend/backend integration boundary rather than the phone's permission
or service-worker support.

**Resolution:** Deploy the clc-core production [[Web Push]] implementation and
its `024_notifications.sql` migration, with `CORE_NOTIFICATIONS__ENABLED=true`
and the stable VAPID key settings documented in clc-core's
`docs/NOTIFICATIONS.md`. No extra frontend URL variable is required: the
production routes intentionally live at `VITE_API_URL`. The client must include
credentials so registration and inbox requests receive the existing API session
cookie.

After deployment, a 503 from the VAPID route means the new code is present but
the notification environment values are disabled/missing. A continuing 404
means staging is still running an older clc-core build. Do not deploy
`dev/webpush` as the production service; it uses local file state and exposes
debug endpoints.

After the backend/configuration is deployed, an affected user can tap **Enable
notifications** again. Notification permission may already be granted, but no
push subscription was created by the failed attempt.
