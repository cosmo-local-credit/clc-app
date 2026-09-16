# Image upload implementation plan

Status: **implemented** — storage-server `v0.7.0-rc` (deployed to staging),
clc-core `develop`, and `apps/web` + `apps/admin` on `sohail/admin-console`.
Remaining: voucher icon/banner in admin (needs a clc-core voucher write
endpoint) and the report composer in `apps/web`.

This plan covers image upload and persistence logic for `apps/web` and
`apps/admin`. It deliberately excludes component design, image pickers, cropping,
and other UI work. The focus is TanStack Query orchestration, shared API clients,
`clc-core` writes, database representation, storage authentication, retries, and
failure recovery.

The storage service is `github.com/cosmo-local-credit/storage-server`, checked out
at `~/ge/storage-server`. It belongs to the same organization as `clc-core` and was
renamed from its Sarafu-era module path in `a6149cc`, so there is no
`~/clc/storage-server` and no second repository to confirm. Every claim about it
below was read from that checkout.

## 1. Outcome

Both apps should use one shared upload pipeline:

```text
apps/web or apps/admin
  │
  │ 1. fetch a readable copy of the session token (cached in memory only)
  ▼
clc-core
  │
  │ 2. return the session's EdDSA token
  ▼
storage-server
  │
  │ 3. normalize once, store immutable object, return URL + metadata
  ▼
client form/draft
  │
  │ 4. submit domain write containing the returned URL(s)
  ▼
clc-core + PostgreSQL
  │
  │ 5. return the saved domain representation
  ▼
TanStack Query cache
     6. seed exact detail; invalidate affected lists/facets
```

The image bytes never pass through `clc-core`, never enter PostgreSQL, and never
enter Zustand. PostgreSQL stores immutable HTTP URL references. TanStack Query
stores the upload token, mutation state, and saved server representations;
the selected `File` and temporary object URL remain component/form state.

## 2. Recommended decisions

| Decision                 | Rule                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload path              | Browser uploads directly to `storage-server`; `clc-core` does not proxy image bytes.                                                                                             |
| Storage tenancy          | New uploads go to a fresh CLC-owned bucket behind a CLC CDN host. Repoint `cdn_base_url` and `bucket_name` before anything writes.                                               |
| Authentication           | Storage already accepts the session JWT; the browser cannot read it. One endpoint hands JS a token for the existing session — short-lived and scoped, because that is free.      |
| Grant identity           | Key and mint the grant by the session address from `GET /auth/session`, never by the connector address. A connected wallet without a session is a guest.                         |
| Shared frontend boundary | The multipart client and Query option factories live in `packages/api`, so web and admin cannot drift.                                                                           |
| Error taxonomy           | `StorageApiError` is its own class. It must not extend `BackendApiError`: both apps treat an unauthenticated `BackendApiError` as session expiry.                                |
| Domain persistence       | Store URL columns on single-image entities and ordered rows for post images. Do not create a polymorphic image table.                                                            |
| Cache truth              | A storage response alone never updates a profile, voucher, pool, or post query. Only a successful `clc-core` domain write does.                                                  |
| Post visibility          | A post created by a normal user is `SUBMITTED`, and `GET /api/v2/reports/:id` hides it from everyone including its author. Never seed a public detail key with one.              |
| Retry identity           | Generate an opaque upload ID before calling `mutate`; every retry reuses that ID, file, purpose, and width. The fixed ID is what makes the key stable.                           |
| Image replacement        | Upload the replacement first, then atomically replace the database URL. Do not delete the previous object in the request path.                                                   |
| Mutation retries         | Storage upload may retry once for a retryable failure, because reusing the upload ID reproduces the same object key. Domain POSTs do not retry until they have idempotency keys. |
| Duplicate creates        | Prevented in the UI: submit disabled while pending, `retry: 0`, mutation scope. Backend `clientMutationId` is deferred, not required for launch.                                 |
| Offline behavior         | Initial uploads are online-only and are not persisted as paused mutations. Persisting a `File` in the normal Query persister is explicitly unsupported.                          |

## 3. Current state and gaps

### Storage server

The current service already provides most of the byte-processing contract:

- `POST /v1/upload` as `multipart/form-data`;
- fields `file`, `folder`, `name`, and `width`;
- JPEG, PNG, and WebP input;
- configured widths `400`, `800`, and `1280`;
- no upscaling, EXIF orientation, metadata removal, bounded pixel count, and
  bounded concurrent normalization;
- one immutable object per request, named
  `<folder>/<name>_<actual-width>_<content-hash>.<extension>`;
- a retry reusing the same `folder`, `name`, and `width` returns the same URL;
- `Cache-Control: public, max-age=31536000, immutable`;
- an 8 MiB **request** body (`api.max_body_size = 8`, shifted to bytes in
  `cmd/main.go`) — Echo's `BodyLimit` counts the multipart boundaries and part
  headers too, so the file itself must be smaller than that;
- a 12.5 MP source cap, and four concurrent normalizations process-wide.

It currently returns only `payload.s3`, accepts only the `voucher` and `profile`
folders, and accepts any valid current `clc-core` user or service JWT. It has no
delete endpoint.

Its configuration is still inherited from Sarafu and must be repointed before
anything writes: `cdn_base_url = "https://content.sarafu.network"`,
`bucket_name = "sarafu-network"`, and an origin allowlist of `sarafu.network`,
`preview.sarafu.network`, and `localhost:3000`. This pipeline uploads to a fresh
CLC bucket behind a CLC CDN host; until that is configured, every URL it produces
points at the wrong service. Nothing is inherited from the old bucket, and no
legacy object is in scope for anything in this plan.

Its error contract is narrower than a generic HTTP reading suggests. Unsupported
input is `400 UNSUPPORTED_FILE_EXTENSION`, not 415. An over-cap pixel count is
`400 IMAGE_TOO_LARGE`, not 413. Only an oversized body is `413
FILE_SIZE_LIMIT_EXCEEDED`; timeouts and cancellations are 408. It never emits 429.

### clc-core

The schema already has:

- `vouchers.icon_url` and `vouchers.banner_url`;
- `pools.image_url` and `pools.banner_url`;
- `reports.image_url` for the feed cover;
- ordered `report_images` rows with URL, dimensions, byte size, and caption;
- pool deployment propagation for `image_url` and `banner_url`;
- report create/update endpoints that replace all report relations in one
  transaction and reject non-HTTP image URLs.

The missing pieces are:

- no user avatar/profile-image column;
- voucher deploy does not accept or propagate icon/banner URLs;
- pool edit does not accept its existing image/banner fields;
- no user-owned voucher or pool profile update endpoints;
- no admin voucher update endpoint;
- profile reads/writes do not include an avatar URL;
- storage requires a bearer token, while the current SIWE and WebAuthn app flows
  generally retain the session JWT only in an HttpOnly cookie;
- report write endpoints exist, but the shared TypeScript reports client is
  read-only;
- no read path for a post its author has just written. Create sets `SUBMITTED`
  unless the caller is a superadmin, `GET /api/v2/reports/:id` reads through
  `GetReport`, which returns approved rows only, and the author and filtered feeds
  hard-code `r.status = 'APPROVED'`. `GetReportForMutation` sees the row, but it is
  reachable only from inside the write handlers.

Two items commonly listed as missing are already done: report create and update
both return the complete saved representation, and both nest it as
`result.report`.

### clc-app

`packages/api` already owns backend resource clients and canonical query keys.
Existing mutation behavior also provides the pattern to retain:

- exact detail responses are written with `setQueryData` where possible;
- resource roots such as `authKeys`, `voucherKeys`, `poolKeys`, and `reportKeys`
  own invalidation;
- mutations default to `retry: 0` in both applications;
- admin retries only retryable read failures;
- no query result is copied into Zustand.

The existing JSON `HttpClient` must not be reused for storage uploads. It assumes
JSON bodies and supplies `Content-Type: application/json`; a multipart request
must let the browser generate its boundary. It also unwraps `{ ok, result }`,
which is not the storage envelope.

Both apps route an unauthenticated `BackendApiError` into session handling from a
cache-level `onError`: admin clears every `["clc"]` query and re-reads the session,
web invalidates the session query. A storage 401 must therefore never arrive as a
`BackendApiError`, or one rejected upload token signs the operator out.

The write surfaces this plan lands on are not uniform, and the differences decide
its sequencing:

- **admin account** — `edit-account-profile-sheet.tsx` already saves through
  `useUpdateUserProfile`, which writes the cache with `useWriteUserToCache`. An
  avatar can land here as soon as `clc-core` carries the field.
- **admin pool** — `use-update-pool-profile.ts` is live and is the seed-detail,
  return-the-invalidation-promise pattern. It simply has no image fields yet.
- **admin voucher** — `edit-voucher-sheet.tsx` exists and documents itself as a
  no-op: there is no admin voucher write in `clc-core` to call.
- **admin posts** — no write surface at all, only a read-only by-author tab.
- **web** — profile update, voucher deploy, and pool deploy exist. There is no post
  composer.

Web sign-out invalidates `authSessionQueryKey` and nothing else — it has no
`removeQueries` sweep, unlike admin's `clearProtectedQueries` over `["clc"]`.

## 4. Contracts to establish first

### 4.1 Readable session token

Add an authenticated endpoint to `clc-core`:

```http
POST /auth/storage-token
Cookie: __clc_auth=<HttpOnly session>

200 OK
Cache-Control: no-store
{
  "ok": true,
  "result": {
    "token": "<EdDSA JWT>",
    "expiresAt": "2026-08-20T10:05:00Z"
  }
}
```

**Decision: this endpoint returns the existing 30-day session JWT, verbatim.** No
new token type, no new claims, and — importantly — **no change to storage-server's
authentication at all**. Its `authenticate` already takes any EdDSA token clc-core
signed whose claims carry `userId`, `ethereumAddress`, and `role`, requiring `exp`
and `iat`, which is exactly what a session token carries.

What is missing is _delivery_, and that is the whole reason this endpoint exists:

- clc-core sets the session as an **HttpOnly** cookie, so JavaScript cannot read
  it;
- storage reads only the `Authorization` header — it never looks at a cookie — and
  it is served from a different host, so the cookie would not be sent there even if
  it were readable;
- `POST /auth/siwe/verify` already returns a raw token in its body as
  `{ token, address, expiresAt }`, but neither app calls it. The two they do call,
  `/auth/signin` and `/auth/webauthn/verify`, return only `{ userId, role }` plus
  the passkey's credential fields.

Adding `token` to those two sign-in responses is not enough on its own: the cookie
survives a reload or a PWA relaunch and an in-memory token does not, so a
signed-in user would find uploads broken with no recovery but signing out and back
in. Hence one endpoint whose entire job is "give me a readable token for the
session I already have".

**Echo the cookie; do not re-mint.** `sessionHandler` already reads
`__clc_auth` directly, so this handler can return that value with its own `exp`.
Calling `generateUserToken` instead would issue a _fresh_ 30-day token on every
upload, silently rolling the session forward indefinitely — a session that never
expires as long as someone keeps uploading.

Do **not** attach the token to `GET /auth/session` instead. Both apps cache that
query, and web dehydrates it into the SSR payload, which would put a bearer token
in the HTML.

The endpoint is behind `flexibleAuthMiddleware` plus `requireUserAuth`. Both a
normal user and a superadmin receive the same upload capability. A service token
does not need this browser endpoint.

The claims are whatever `UserJWTClaims` already carries — `userId`,
`ethereumAddress`, `role`, `iat`, `exp` at +30 days — signed by the existing
`clc-core` Ed25519 key. Nothing is added, so `aud` and `scope` do not exist and
storage has nothing new to validate. Its current "accept any valid clc-core user or
service token" behavior is now the intended design rather than something to tighten
later.

**What this exposes, recorded deliberately.** A 30-day bearer token becomes
reachable from JavaScript, and `flexibleAuthMiddleware` step 2b accepts a user JWT
in an `Authorization: Bearer` header — not only in the cookie. So an exfiltrated
token is full API access as that user, from anywhere, until it expires; signing out
clears the cookie but there is no token blocklist, so the copy stays valid. The
cookie alone was not exfiltratable this way. The rules below are what keep that
bounded, and they are requirements, not suggestions:

- the token lives **only** in the in-memory Query cache. Never `localStorage`,
  `sessionStorage`, Zustand, a URL, IndexedDB, or a persisted Query cache;
- the endpoint answers `Cache-Control: no-store`;
- it is never fetched in a route loader or during SSR, so it cannot reach the
  dehydrated HTML;
- the cached copy is removed at every identity boundary (§5.3);
- it is sent to storage and nowhere else — the clc-core clients keep using the
  cookie.

If that trade ever needs reversing, the same endpoint can return a short-lived
audience-scoped token instead, and storage can start requiring it. No client change
is involved: the client asks for a token and sends it. That is the reason to keep
this one endpoint rather than widening the sign-in responses.

### 4.2 Enriched upload response

Keep the existing response compatible and add normalized output metadata:

```json
{
  "ok": true,
  "payload": {
    "s3": "https://content.example/report/abc_1280_a3f91c2e.webp",
    "width": 1280,
    "height": 853,
    "byteSize": 82972,
    "contentType": "image/webp"
  }
}
```

`packages/api` normalizes `payload.s3` to a domain-neutral `url`:

```ts
export type UploadedImage = {
  url: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};
```

Return actual output dimensions, not the requested width or source dimensions.
The storage service already has the values after normalization. Returning them
avoids decoding the result in both apps and lets reports reserve the correct
aspect ratio.

### 4.3 Purpose policy

The caller chooses a semantic purpose; shared code translates it to the storage
folder and fixed width. Screens must not choose arbitrary folders or widths.

| Purpose          | Storage folder | Width | Database destination                                         |
| ---------------- | -------------- | ----: | ------------------------------------------------------------ |
| `profile.avatar` | `profile`      |   400 | `users.avatar_url`                                           |
| `voucher.icon`   | `voucher`      |   400 | `vouchers.icon_url`                                          |
| `voucher.banner` | `voucher`      |  1280 | `vouchers.banner_url`                                        |
| `pool.image`     | `pool`         |   400 | `pools.image_url`                                            |
| `pool.banner`    | `pool`         |  1280 | `pools.banner_url`                                           |
| `report.image`   | `report`       |  1280 | `report_images.url`; optionally `reports.image_url` as cover |

Add `pool` and `report` to `storage-server`'s configured folder allowlist. A
profile avatar is intentionally 400px even in admin; banners and post images use
1280px because the same immutable object serves mobile detail and desktop audit
views.

Use opaque 32-character UUID values without hyphens for `name`, matching the
convention already in the imported catalog. The service enforces
`^[A-Za-z0-9_-]{1,64}$`, so a canonical hyphenated UUID is also fine and a `/` or
`.` never is. Do not put an email, wallet address, title, database ID, or original
filename in an object key.
Create flows do not have a database ID yet, and object paths are public.

## 5. Shared TanStack Query layer

### 5.1 Files

Add these shared modules:

```text
packages/api/src/features/images/
  client.ts          multipart transport + StorageApiError
  queries.ts         token query and upload mutation option factories
  policy.ts          purpose -> folder/width mapping
  batch.ts           bounded, order-preserving multi-upload helper
```

Export them from `packages/api/package.json`. Each app creates one upload client
from `VITE_STORAGE_URL`; it must not implement its own `fetch` wrapper or upload
hook.

The serializable image-reference types may live in `@clc/core` if domain schemas
need them. Browser `File`, `FormData`, and upload transport must not move into
`packages/core`, which remains React Native compatible and network-free.

### 5.2 Multipart client

The client accepts this input:

```ts
export type UploadImageInput = {
  file: File;
  purpose: ImagePurpose;
  uploadId: string;
};
```

For each request it:

1. resolves `purpose` through the fixed policy;
2. appends `file`, `folder`, `name=uploadId`, and `width` to `FormData`;
3. sends `Authorization: Bearer <session token>`;
4. does **not** set `Content-Type`;
5. parses the storage envelope and normalizes `s3` to `url`;
6. throws `StorageApiError { status, code, retryAfterMs? }` on failure — a class
   of its own, never a subclass of `BackendApiError`, because both apps read an
   unauthenticated `BackendApiError` as session expiry and admin's reaction is to
   clear every `["clc"]` query and bounce the operator to sign-in;
7. classifies on the service's `code` as well as the status, because the statuses
   alone do not separate the cases:

| Outcome                                                                                                                          | Status | Retryable                |
| -------------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------ |
| network failure, no response                                                                                                     |      — | yes                      |
| `DEADLINE_EXCEEDED`, `REQUEST_CANCELED`                                                                                          |    408 | yes                      |
| any 5xx, including `INTERNAL_SERVER_ERROR`                                                                                       |    5xx | yes                      |
| `UNAUTHORIZED`                                                                                                                   |    401 | token path only, see 5.4 |
| `UNSUPPORTED_FILE_EXTENSION`, `IMAGE_TOO_LARGE`, `INVALID_WIDTH`, `INVALID_FOLDER`, `INVALID_NAME`, `MISSING_*`, `NOT_MULTIPART` |    400 | no                       |
| `FILE_SIZE_LIMIT_EXCEEDED`                                                                                                       |    413 | no                       |

Note what is absent. The service never returns 415 — an unsupported image is a
400 — and it never returns 429, so treating those two as the terminal/retryable
boundary mislabels every real rejection. Honor `Retry-After` if a proxy in front
of it supplies one.

The upload ID is generated before `mutate` is called. Generating it inside the
mutation function would create a different object on a Query retry.

### 5.3 Upload token query

Treat the token as server state even though its HTTP endpoint is a POST. It is
stateless from the product's perspective, safe to re-read, and benefits from
deduplication across simultaneous uploads.

```ts
export const imageKeys = {
  all: ["clc", "images"] as const,
  token: (identity: string) => ["clc", "images", "token", identity.toLowerCase()] as const,
};

export function storageTokenQueryOptions(auth: AuthClient, identity: string) {
  return queryOptions({
    queryKey: imageKeys.token(identity),
    queryFn: () => auth.getStorageToken(),
    // The token outlives any session in the tab, so there is nothing to refresh
    // on a timer. It is dropped on an identity boundary and on a storage 401.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
    retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
    meta: { sensitive: true },
  });
}
```

`identity` is the session address from `GET /auth/session` in **both** apps — not
the connector address. `apps/web` can hold a connected wallet that has no backend
session, and treats that as a guest; keying on the wallet would cache one account's
token under another account's key. The token is a fact about the cookie, so it is
keyed by whose cookie it is.

Because the token is the 30-day session, expiry races disappear: it cannot lapse
mid-upload the way a five-minute grant could, and `upload_timeout` needs no margin
against it. What replaces that concern is lifetime hygiene — a copy that outlives
the session it came from is the whole risk, so `staleTime: Infinity` is paired with
unconditional removal at every identity boundary, and a moderate `gcTime` so an
idle tab drops it on its own.

Inside the upload mutation use
`queryClient.fetchQuery(storageTokenQueryOptions(...))`. With `staleTime: Infinity`
this returns the cached token without a request; the 401 path below removes the
entry first, so the next `fetchQuery` genuinely re-reads. `ensureQueryData` would
behave the same here, but `fetchQuery` keeps the intent explicit and stays correct
if the endpoint is ever switched to a short-lived token.

Never call this query from a route loader or prefetch it during SSR. `apps/web`
dehydrates successful queries into the SSR payload, so one loader call ships the
token in the HTML. It should exist only after a client-side upload action. If Query
persistence is added in the future, the persister must exclude queries with
`meta.sensitive === true`.

Removing the token at an identity boundary costs nothing in admin and is new code
in web, and it matters more here than it would for a five-minute grant: this copy
stays cryptographically valid for 30 days regardless of sign-out. Admin's
`clearProtectedQueries` already sweeps `["clc"]`, which covers
`["clc", "images", "token", …]`. Web's sign-out invalidates `authSessionQueryKey`
and nothing else, so it needs an explicit `removeQueries` for the token key — on
sign-out, on wallet switch, and on a session that resolves to a different address.

### 5.4 Upload mutation

Expose a `mutationOptions` factory from `packages/api`, and consume it with
`useMutation` in either app:

```ts
export function uploadImageMutationOptions(
  auth: AuthClient,
  storage: ImageUploadClient,
  identity: string,
) {
  return mutationOptions({
    mutationKey: [...imageKeys.all, "upload"] as const,
    networkMode: "online",
    gcTime: 60_000,
    mutationFn: async (input: UploadImageInput, context) => {
      const tokenOptions = storageTokenQueryOptions(auth, identity);
      let session = await context.client.fetchQuery(tokenOptions);

      try {
        return await storage.upload(input, session.token);
      } catch (error) {
        if (!isStorageUnauthorized(error)) throw error;

        context.client.removeQueries({ queryKey: tokenOptions.queryKey, exact: true });
        session = await context.client.fetchQuery(tokenOptions);
        return storage.upload(input, session.token);
      }
    },
    retry: (failureCount, error) => failureCount < 1 && isRetryableStorageError(error),
  });
}
```

The explicit refresh happens once **per `mutationFn` run**, not once per user
action. A bare second 401 is terminal for that run — §5.2 does not classify 401 as
retryable — but a retryable 5xx after a successful refresh re-enters `mutationFn`
through the Query retry, and that run may refresh again. Worst case for one upload
is two attempts, two token reads, and four storage calls. Bound it if that matters.
Since the token is the session itself, a second 401 most often means the session is
genuinely gone — route it into the app's existing session-expiry handling rather
than reporting a bad image — with a mismatched verifying key or clock the other
candidate.

Upload success has no cache invalidation callback. The object is not yet part of
any domain entity. The calling save flow receives `UploadedImage`, replaces the
new-file draft with that resolved reference, and then runs the domain mutation.
If the domain mutation fails, a retry reuses the resolved URL rather than
re-uploading the bytes.

Call `uploadMutation.reset()` after the URL has been consumed and the form closes.
Mutation state retains its variables, including `File`, while the observer is
active; resetting promptly avoids retaining large file handles longer than
needed.

### 5.5 Multiple post images

Do not fire up to 50 browser uploads at once merely because the backend accepts
50 report rows. Add an order-preserving helper with a concurrency limit of three.
The storage server currently normalizes at most four images concurrently, so
three per browser leaves capacity for other callers.

Each selected item has a stable local ID and one of these states:

```ts
type PendingReportImage = {
  localId: string;
  file: File;
  uploadId: string;
  caption: string | null;
};

type ResolvedReportImage = {
  localId: string;
  uploaded: UploadedImage;
  caption: string | null;
};
```

The batch helper returns results in input order even when requests finish out of
order. Use an all-settled result so successful items become resolved draft items
and only failed items need another upload. Do not rely on the last mutation
observer state to represent a batch: TanStack Query permits consecutive
mutations to resolve in a different order.

For `report_images`, map storage metadata as follows:

- `url` -> `url`;
- normalized `width`/`height` -> `max_width`/`max_height`, because the existing
  database defines those as intrinsic dimensions;
- `byteSize` -> `byte_size`;
- leave the existing `width`/`height` display-box columns null unless an editor
  explicitly supplies a display size;
- array order -> one-based `ordinal` in the existing transaction.

**This mapping is invisible through the current shared client, and that has to be
fixed in the same change.** `packages/api`'s `ReportImage` and its normalizer keep
only `url`, `width`, and `height`; `maxWidth`, `maxHeight`, `byteSize`, and
`caption` are dropped even though `clc-core` returns all four. Write the normalized
size into `max_*`, leave the display box null, and a re-read yields
`width: null, height: null` — no aspect ratio to reserve, which was §4.2's whole
reason for returning dimensions, and a §14 criterion unmet.

Extend `BackendReportImage`, `ReportImage`, and `normalizeReportImage` to carry all
four fields. That is the principled fix: it is our own client, and the data is
already on the wire. Copying the normalized size into the display-box columns is a
fallback only if that client change is deferred, and it records an editor intent
that does not exist.

`ReportDetail` also has no `status`. Any later "my pending posts" surface needs it,
along with a query key that is not the public detail key.

The report cover should reference one of the submitted report image URLs rather
than upload a duplicate object. `reports.image_url` remains a denormalized cover
pointer because the feed can read it without aggregating `report_images`.

### 5.6 Entity mutation scopes

Use TanStack Query mutation scopes for assign-all updates so concurrent saves of
the same record cannot finish out of order:

```ts
scope: {
  id: `pool-profile:${address.toLowerCase()}`;
}
```

Apply the same pattern to a profile identity, voucher address, and report ID.
Scopes serialize writes; they do not deduplicate them, so create endpoints still
need backend idempotency keys.

## 6. Database representation

Everything here is additive schema work and belongs in the migration set: a new
nullable column never disturbs a reader that does not select it. Concretely, one
migration adds `users.avatar_url` and `deployed_tokens.icon_url/banner_url`, then
extends `upsert-voucher-from-deploy` so the two columns travel into `vouchers` on
confirmation. `token_deploy_meta` is not a second home for them: migration 002
folded it into `deployed_tokens` and dropped the table, so altering it fails.

Keep image references with the domain facts they describe:

| Entity                  | Schema work                                                                                                                                                                         | Reason                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| User profile            | Add nullable `users.avatar_url TEXT`.                                                                                                                                               | One current avatar is a scalar user attribute.                               |
| Voucher                 | Keep `vouchers.icon_url` and `vouchers.banner_url`.                                                                                                                                 | The catalog is the single home of living voucher metadata.                   |
| Voucher deploy pipeline | Add nullable `icon_url` and `banner_url` to `deployed_tokens`, then carry them through `upsert-voucher-from-deploy`: the CTE, the insert list, and the `ON CONFLICT DO UPDATE` set. | The deploy must retain metadata until the on-chain address exists.           |
| Pool                    | Keep `pools.image_url` and `pools.banner_url`; keep propagation through `deployed_pools`.                                                                                           | Already matches the desired model.                                           |
| Report/post             | Keep `reports.image_url` plus ordered `report_images`.                                                                                                                              | Cover reads are frequent; multiple images have order and per-image metadata. |

Do not add `images(entity_type, entity_id, ...)`:

- it cannot have real foreign keys to four entity types;
- it makes simple profile/catalog reads join a polymorphic table;
- it duplicates the existing normalized `report_images` relation;
- image ownership is already decided by the domain write endpoint, not by the
  storage object.

Do not store base64, blobs, original filenames, bearer tokens, local object URLs,
or a second copy of the entity image list in PostgreSQL.

Add HTTP URL checks for new columns and missing checks for existing image columns:

```sql
CHECK (avatar_url IS NULL OR avatar_url ~* '^https?://')
```

`reports.image_url` is the one that needs care, and not hypothetically. Six
approved reports still hold base64 data URIs of up to 876 kB, left in place by
migration 010 and nulled at read time on purpose — there is a named test asserting
that gate. A check on that column must be added `NOT VALID` and must not be
`VALIDATE`d until those rows are cleaned, or the validate step fails. Leaving it
permanently `NOT VALID` is a fine outcome: it constrains every new write, which is
all this plan needs.

Application validation remains authoritative and trims the URL. Do not hard-code
the current CDN hostname in a database constraint: imported catalog data already
contains other HTTP hosts, and a CDN hostname migration should not require
rewriting a schema constraint.

For update payloads, image fields are explicit assign-all values:

- current URL means unchanged;
- new returned URL means replace;
- `null` means clear.

Do not overload an omitted JSON field to mean both preserve and clear. TypeScript
update payloads should make the relevant image fields required and nullable.

**`update-pool-profile` needs one deliberate exception, fixed in clc-core.** That
statement assigns ten columns and does not currently touch `image_url` or
`banner_url`, which is the only reason a pool's images survive an operator editing
its description. Adding the two columns to a plain assign-all list would make the
console that is already deployed — which sends no image fields — blank them on
every save. Follow the precedent `update-user-profile` already sets for geo:

```sql
image_url  = CASE WHEN $11 IS NULL THEN image_url  ELSE NULLIF($11, '') END,
banner_url = CASE WHEN $12 IS NULL THEN banner_url ELSE NULLIF($12, '') END
```

An omitted field preserves, so an old client is harmless; an empty string clears,
so the form can still remove an image. The same treatment applies to any future
user-facing voucher or pool update. Once every client sends the fields, the CASE
can be collapsed back to a plain assignment in its own change.

## 7. clc-core API and store work

### Profile

- Add `avatarUrl` to `UpdateProfileRequest`, `User`, all user projections, profile
  GET responses, admin user responses, and both user/admin profile writes. The GET
  response is a hand-built map in a different handler from the write, so the two
  agree only if a test round-trips them: a write projection carrying the avatar and
  a read projection omitting it loses it on the first refetch.
- Every user projection, not only the profile read. A console that patches cached
  rows from an approve/reject/limits response would otherwise blank the avatar on
  an unrelated action.
- Change profile update clients to return the complete saved representation
  rather than `void`.
- Preserve the existing authorization: users edit themselves; superadmins edit
  the addressed user through the admin endpoint.

### Voucher

- Add `iconUrl` and `bannerUrl` to `DeployTokenRequest`, worker args,
  `DeployedToken`, insert/select queries, and confirm-path promotion into
  `vouchers`.
- Add an assign-all voucher profile update in the catalog store.
- Add a user endpoint that requires the caller to match `owner_address`, plus an
  admin endpoint for any voucher. `owner_address` is nullable, and SQL never makes
  a NULL equal the caller, so imported rows stay uneditable by users. That is the
  intended default — do not coalesce it away.
- Return the complete normalized voucher detail after an update.
- Never make image fields on-chain metadata; they remain off-chain catalog facts.
- Validate image URLs as `http_url`, never `url`. The `url` tag accepts `ftp:`,
  `data:` and `javascript:`, and for a deploy the HTTP-only database constraint is
  not reached until the worker has already signed and broadcast the transaction —
  `MaxAttempts` is 1, so the job does not retry and the nonce is spent. For the
  pointer-valued update payloads the tag is `http_url|eq=`, because `omitempty` does
  not skip a pointer to an empty string and `""` is the clearing sentinel.

### Pool

- The create endpoint and deployment pipeline already accept and propagate
  `imageUrl` and `bannerUrl`; add them to the TypeScript `PoolDeployPayload` and
  draft-to-payload conversion.
- Add `imageUrl` and `bannerUrl` to the existing pool profile update request/store
  assignment.
- Add a user endpoint that verifies `owner_address`; keep the current
  superadmin endpoint for admin.
- Return the complete pool row, as the current admin update already does.

### Reports/posts

- Add create/update methods and write types to the shared reports client. The
  response already carries the complete representation, nested as `result.report` —
  unwrap it the way the existing read client unwraps `result.report`, and do not
  seed the envelope.
- Keep the current transactional scalar update plus relation replacement.
- For new writes, require the cover URL to be null or present in `images`. Legacy
  reports whose imported cover is independent can remain readable.
- Continue enforcing the current author-or-superadmin update rule and the maximum
  of 50 image rows.
- **Decided: an author does not read their own `SUBMITTED` post.** Awaiting review
  is the intended state, so no status-aware read endpoint is being added. The web
  composer therefore ends at a confirmation — "submitted, you will see it once it
  is approved" — and §8's web sequence assumes exactly that. Nothing in `clc-core`
  changes for this; it is a UI copy decision.

### Create idempotency

Storage upload is already idempotent; entity creation is not. Two layers address
that, and only the first is in scope now.

**The client prevents the duplicate.** No create is ever fired twice from the UI:

- the submit control is disabled while the mutation is pending — bind it to
  `isPending`, not to a local boolean that a re-render can lose;
- creates keep `retry: 0`, so Query never re-fires one on its own;
- a same-entity mutation scope (§5.6) serializes anything that slips through, so
  two submits cannot interleave;
- there is no "retry" affordance on a failed create. A failed create returns the
  user to the form with their draft and resolved image URLs intact, and submitting
  again is a deliberate act.

That covers the realistic case, which is an impatient double-tap on a slow link.
It does not cover a response lost in transit after the server committed — the
client cannot distinguish that from a failure, which is what the second layer is
for.

**The backend makes the duplicate harmless.** Deferred, not cancelled: add a
`clientMutationId` UUID to report create, voucher deploy, and pool deploy before
enabling any automatic or one-click retry:

- uniqueness is scoped to the authenticated user and operation kind;
- a repeated request returns the original report or tracking ID;
- reuse of the same ID with a different normalized payload returns `409` rather
  than silently accepting different work under one identity;
- the ID is generated once when the create draft begins, not in the mutation
  function;
- PUT updates are naturally idempotent and do not need a new row.

Until this lands, keep Query retry at zero for all three create mutations and rely
on the disabled-while-pending control above. Do not add a retry button to a create
before the key exists.

## 8. Resource save behavior and cache effects

### Profile add/update

1. Upload a newly selected avatar with `profile.avatar`.
2. Submit the complete profile with `avatarUrl` set to the resolved URL or null.
3. On success, write the returned profile to `authKeys.profile(identity)`.
4. In admin, route the response through the existing `useWriteUserToCache` rather
   than writing a second recipe: it patches every cached directory page in place,
   seeds `adminKeys.user(address)` only when a detail screen is already watching,
   and then invalidates the users prefix. `edit-account-profile-sheet.tsx` already
   saves through `useUpdateUserProfile`, so the avatar field can land there the day
   `clc-core` carries it.

The current web profile mutation only invalidates after a `void` response. Returning
the row removes an immediate detail refetch and gives both apps the same result.

Note that admin's account cache helper and the pool helper are deliberately
different shapes — one patches a list of rows, the other seeds a detail and returns
the invalidation promise. Follow whichever already owns the surface being edited;
do not introduce a third.

### Voucher create/update

1. Upload a changed icon and banner only.
2. For create, include both URLs in the deploy request and retain them through the
   deployment worker until catalog promotion.
3. For update, submit both required nullable URL fields in the catalog mutation.
   In admin this is blocked until `clc-core` grows the write: `edit-voucher-sheet.tsx`
   documents itself as a no-op today, and adding image fields to a form that cannot
   save is not progress.
4. On a direct update, seed `voucherKeys.detail(address)` from the response and
   invalidate `voucherKeys.all` for lists, viewport results, search, and facets.
5. On create, wait for deployment success as today, then invalidate
   `voucherKeys.all`; do not invent a voucher detail cache entry before an address
   exists.

### Pool create/update

Use the same sequence as vouchers. Direct updates seed
`poolKeys.detail(address)` and invalidate `poolKeys.all`. Creates wait for the
terminal pool deployment record, then invalidate the pool family.

### Post create/update

Steps 1-4 are common to both apps:

1. Reuse existing URL references for untouched images.
2. Upload only new/replaced files with bounded concurrency.
3. Preserve the user's array order when constructing the complete `images`
   payload.
4. Submit the report create/update only when every pending image has resolved.

The cache step then splits on who is writing, because the row's status does:

- **Superadmin (admin console).** Create lands `APPROVED`. Seed
  `reportKeys.detail(id)` from `result.report` and invalidate report feeds, filtered
  lists, author lists, voucher-linked feeds, and facets.
- **Normal user (web).** Create lands `SUBMITTED`, which `GET /api/v2/reports/:id`
  and every feed query hide — from the author too. Do **not** seed
  `reportKeys.detail(id)`: any later invalidation marks it stale, the refetch 404s,
  and the post the user just wrote turns into a not-found error on screen. Treat
  the 201 body as a one-shot confirmation, keep the user on the composer's success
  state, and do not navigate to `/reports/:id`. Feed invalidation is a no-op here —
  harmless, but do not read it as "the post will appear".

The same trap applies to a web _edit_ of a still-`SUBMITTED` post: the PUT
succeeds and returns the row, and the public detail read still 404s.

This is settled product behavior, not a gap to work around: awaiting review is the
state the post is supposed to be in, and the composer's success screen says so. No
read-back endpoint is planned, so no Query arrangement should try to simulate one.

The upload mutation itself never invalidates `reportKeys`. A partially uploaded
draft is not a report and must not disturb report feeds.

Where a resource root invalidation also marks the just-seeded detail stale, refine
the existing key hierarchy with `lists()` and `details()` prefixes. Prefer that
over hand-editing every cached finite/infinite list shape; there are several
different page representations in this repository.

Return or await the invalidation promise in each domain mutation's `onSuccess`.
TanStack Query keeps `isPending` true until an awaited callback completes, so the
save is not reported complete while active lists still show the old image.

## 9. Failure semantics

| Failure point                      | Required behavior                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client validation                  | Reject before calling storage: anything but JPEG/PNG/WebP, a file over 8 MiB minus a multipart reserve, a source over 12.5 MP. Keep the file in draft with a terminal error. |
| iOS Camera Roll pick               | A HEIC file is a 400 from this service. Convert client-side before upload, or say so in the rejection copy — do not surface `UNSUPPORTED_FILE_EXTENSION` raw.                |
| Token request fails                | No upload starts. A core 401 follows the apps' existing session-expiry handling.                                                                                             |
| Storage returns 401                | Remove the cached token, re-read it, retry that upload once inside `mutationFn`. A second 401 usually means the session is gone.                                             |
| Storage network/408/5xx            | Retry once with the same upload ID; honor `Retry-After` if a fronting proxy sets one.                                                                                        |
| Storage 400 or 413                 | Do not retry. Unsupported type, over-cap pixels, bad width/folder/name are all 400; an oversized body is 413. No network change fixes them.                                  |
| Some post images fail              | Keep successful `UploadedImage` results in the draft and retry only failed items. Do not submit the post yet.                                                                |
| Upload succeeds, domain save fails | Keep the resolved URL in the draft. Retrying save must not upload again. No domain query cache is changed.                                                                   |
| Web post saved                     | The row is `SUBMITTED` and invisible to every read query. Do not seed a public detail key; confirm from the 201 body.                                                        |
| Domain response is lost            | PUT may be retried safely. POST waits for `clientMutationId` support.                                                                                                        |
| User replaces/removes an image     | Save the new/null URL first. Old object cleanup is asynchronous.                                                                                                             |
| User leaves mid-upload             | The request may finish and create an orphan. Never roll back a domain row based on client navigation.                                                                        |
| App is offline                     | With `networkMode: online`, mutation is paused while the page remains alive. Do not claim durable background upload across a reload.                                         |

Do not use optimistic entity images. An object URL is useful for a local preview,
but it is not a server URL and must not be written into Query data. Immutable CDN
URLs make exact-cache seeding after success fast enough without rollback logic.

## 10. Orphan and deletion policy

The reconciler is only safe because the bucket is exclusively ours: every object in
it was written by this pipeline, so `clc-core` is a complete authority on what is
still referenced. That property is a prerequisite, not an assumption — it holds
while the deployment writes to the fresh CLC bucket and nothing else shares it
(§13, phase 0). Imported rows still carrying `content.sarafu.network` URLs sit
outside the managed prefix and are never deletion candidates.

Storage and PostgreSQL cannot share one transaction. Orphans are therefore an
expected distributed-systems state, not something the client can eliminate.

**For now the policy is simply to keep everything.** An unreferenced object costs
storage and breaks nothing, the service has no delete endpoint to call, and a
replaced avatar or banner is a small file. So for the first release, and for as long
as that stays true:

- never synchronously delete the old object during replacement or clearing;
- never let a browser call a delete endpoint;
- retain unreferenced objects indefinitely;
- monitor upload count and bytes against newly referenced URLs, so the growth rate
  is known before anyone needs to act on it.

The rest of this section is the design to reach for **if** that bill ever justifies
it — not first-release work. A service-only reconciler would:

1. list objects under the managed `profile`, `voucher`, `pool`, and `report`
   prefixes;
2. build the referenced set from every relevant URL column/relation, including
   `users`, `vouchers`, `pools`, deployment pipeline rows, `reports`,
   `report_images`, and existing `offerings` image URLs;
3. consider only URLs under the CLC-owned CDN prefix, so imported rows pointing at
   any other host are neither candidates nor references;
4. delete objects absent from the reference set and older than the grace period;
5. emit a dry-run report and metrics before enabling deletion.

None of that exists yet: the service has no list or delete route at all, so this is
a later change rather than a configuration step. If it is built, add list/delete
capability only for a `clc-core` service token, or run the reconciler beside storage
with direct bucket credentials. A user's session token must
never authorize deletion. A generic `image_assets` registry is not needed unless
the product later requires image audit history, moderation state, or quotas per
asset.

## 11. Configuration

Storage's own config needs, in the same change: `cdn_base_url` and `bucket_name`
pointed at CLC infrastructure, `allowed_folders` extended with `pool` and `report`,
and `api.origin` replaced with the CLC origins below.

Add `VITE_STORAGE_URL` to both apps' configuration:

- root `wrangler.toml` production and preview blocks;
- `apps/admin/wrangler.toml` production and preview blocks;
- local `.env` examples.

The preview blocks must restate every variable because Wrangler `vars` are
non-inheritable.

Configure storage CORS for:

- `https://app.cosmolocal.credit`;
- `https://admin.cosmolocal.credit`;
- both projects' base and branch `*.pages.dev` preview origins;
- the explicit local web/admin origins used in development.

Echo's literal origin list does not interpret `*.pages.dev` as a DNS wildcard: on
`echo/v5@5.3.1` the default matcher is `strings.EqualFold` over each configured
string. The hook to override it is `UnsafeAllowOriginFunc` (not `AllowOriginFunc`);
give it one that validates the configured base host or exactly one branch label
beneath it. Do not reach for unrestricted `*` — with the `AllowCredentials: true`
the service currently sets, v5 refuses that combination at middleware
construction. The upload API authenticates by bearer token and sets no cookie, so
dropping `AllowCredentials` is also reasonable.

Preflight must allow `POST`, `Authorization`, and `Content-Type`. Keep the CDN
read path public; only upload is authenticated.

## 12. Test plan

### packages/api

- multipart client sends exactly four fields and does not set `Content-Type`;
- purpose policy selects the expected folder/width;
- success response normalizes `s3`, dimensions, bytes, and content type;
- storage errors preserve status/code and retryability;
- simultaneous uploads share one token query;
- one storage 401 removes and re-reads the token, then retries once;
- upload retry reuses `uploadId`;
- batch upload never exceeds concurrency three and preserves input order;
- partial batch retry does not re-upload successful items;
- sign-out, wallet switch, and a session resolving to a different address each
  remove the token query, in web as well as admin;
- the token is keyed by the session address, and a connected-but-sessionless wallet
  never reads one;
- the token never reaches `localStorage`, `sessionStorage`, or a dehydrated payload;
- error classification is driven by `code`: `IMAGE_TOO_LARGE` and
  `UNSUPPORTED_FILE_EXTENSION` are terminal despite being 400, 408 and 5xx are not;
- `StorageApiError` is not an instance of `BackendApiError`, so neither app's
  cache-level session handling fires on a storage 401;
- a report image round-trips its normalized dimensions and byte size through the
  shared client.

### Query/domain mutation tests

- upload success alone changes no domain query;
- domain failure after upload leaves existing detail/list cache unchanged;
- profile, voucher, pool, and report success seed their exact detail keys;
- related root/list invalidations are awaited;
- same-entity mutation scopes serialize assign-all updates;
- create mutations remain `retry: 0` until backend idempotency exists;
- a web report create seeds no public detail key, and an invalidation after it
  leaves no key that would refetch into a 404;
- mutation reset releases the successful `File` variables after consumption.

### clc-core

- the storage-token endpoint requires a valid user cookie, rejects a service token,
  answers `no-store`, and returns the cookie's own token rather than a freshly
  minted one — two calls in a row return the same string and the same `expiresAt`;
- profile avatar is read, written, cleared, and returned for user/admin routes;
- voucher image URLs survive request -> worker -> deployed token -> catalog
  promotion;
- pool image URLs survive create and update paths;
- owner checks reject edits to another user's voucher/pool while superadmin paths
  succeed;
- report image order and normalized metadata persist in one transaction;
- report cover validation accepts null/member URL and rejects an unrelated new
  URL;
- URL constraints reject data URIs;
- repeated `clientMutationId` returns the original create result.

### storage-server

- an ordinary clc-core user token is accepted, an unsigned or foreign-key token is
  not;
- `pool` and `report` folders pass while unknown folders fail;
- enriched response metadata matches stored bytes;
- identical input/name/width produces the same URL;
- expired token, oversized body, excessive pixel count, unsupported image, and
  encode saturation have stable error contracts;
- CORS preflight succeeds for web, admin, and configured previews.

### End-to-end

For each app, cover one single-image update and one multi-image report write:

1. authenticate;
2. obtain the upload token;
3. upload directly to storage;
4. save URL(s) through `clc-core`;
5. refetch the resource from a clean QueryClient;
6. fetch each CDN URL and verify immutable cache headers.

Also simulate a dropped domain response and verify that a safe retry does not
create a second domain resource once idempotency is enabled.

## 13. Delivery order

0. **Storage tenancy:** a fresh CLC bucket, a CLC CDN host, and a deployment of
   the service configured for both. Nothing else in this plan can be verified
   end to end until an uploaded URL resolves on a host we own.
1. **Storage compatibility:** enriched response, `pool`/`report` folders, CORS, and
   tests. Authentication needs no change — a session token already validates. Keep
   `payload.s3` so old callers remain compatible.
2. **clc-core foundation:** schema migration, storage-token endpoint, profile
   avatar, voucher propagation/update, pool update, ownership checks, idempotency
   keys. Report create/update already return the full representation, and an
   author reading their own `SUBMITTED` post is explicitly out of scope (§7).
3. **Shared frontend layer:** storage client, purpose policy, token query, upload
   mutation options, error types, and batch helper in `packages/api`.
4. **apps/web wiring:** profile, voucher create/update, pool create/update, and a
   post composer that ends at a "submitted for review" confirmation.
5. **apps/admin wiring:** the avatar on the existing account sheet (live now),
   image fields on the existing pool sheet (live now), then the voucher sheet once
   phase 2 gives it an endpoint to call. There is no admin post surface to wire.
6. **Operational cleanup:** orphan metrics only. Objects are retained
   indefinitely; deletion and the reconciler are deferred until the storage bill
   argues for them (§10).

Each phase should ship only after its contract tests pass. Deploy storage's
backward-compatible response and clc-core's nullable schema additions before a
client starts sending the new fields.

## 14. Acceptance criteria

- Both apps use the same `@clc/api` upload implementation.
- No app stores the session JWT outside the in-memory Query cache, and it never
  appears in dehydrated HTML, `localStorage`, or a persister.
- No image bytes or base64 strings are sent to `clc-core` or PostgreSQL.
- Exact retry of an upload cannot create a second object URL.
- A failed database save never makes a domain query expose an unsaved URL.
- Retrying a database save after a successful upload does not resend image bytes.
- Multiple post images retain order and upload with bounded concurrency.
- Profile, voucher, pool, and report reads return their persisted URL fields from
  a fresh cache in both apps.
- User ownership and superadmin override are enforced by `clc-core`, not by
  storage or UI state.
- A double-tapped submit cannot create two reports, vouchers, or pools: the control
  is disabled while pending and no create retries automatically.
- No client, and no code path reachable from a browser, can delete a stored object.
  Unreferenced objects are retained and counted, not collected.
- A report image's normalized dimensions and byte size survive a write and a fresh
  read through `@clc/api`.
- No cache entry seeded by a write can be refetched into a 404: a post a web user
  created is confirmed from the response, never from a public detail query.
- A storage failure never signs an operator out of the admin console.

## 15. TanStack Query references used

- [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations):
  mutations do not retry by default, consecutive mutations may resolve out of
  order, mutation scopes serialize matching writes, and persisted paused
  mutations require serializable state/default functions.
- [Invalidations from mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations):
  returning the invalidation promise keeps the mutation pending until related
  queries are refreshed.
- [QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclient-ensurequerydata):
  `ensureQueryData` may return stale data; the upload token uses `fetchQuery` so the
  intent survives a later switch to a short-lived token.
