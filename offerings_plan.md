# Offerings CRUD and photo upload plan

Status: **proposed**. This plan spans three repositories:

- `clc-app` (this repository): shared domain/API contracts plus the web and
  admin write surfaces;
- `../clc-core`: database migration, authorization, store methods, and HTTP
  endpoints;
- `~/ge/storage-server`: the dedicated bucket folder used for offering photos.

The outcome is a first-class offering linked to exactly one voucher, with this
editable product contract:

```ts
type OfferingWrite = {
  name: string;
  description: string;
  imageUrl: string | null; // the optional photo after upload
  pricePerUnit: string; // decimal text, denominated in the linked voucher
  unit: OfferingUnit;
  commodityType: "GOOD" | "SERVICE";
};
```

`imageUrl` is the repository's established name for a stored photo reference.
The image bytes never pass through `clc-core` and never enter PostgreSQL. The
browser uploads the bytes directly to `storage-server`, then submits the returned
immutable URL in the offering write.

## 1. Current state and actual gaps

The read path already exists and is in use:

- public `GET /api/v2/vouchers/:address/offerings`;
- authenticated `GET /api/v2/pools/:address/offerings`;
- authenticated `GET /api/v2/offerings`;
- `packages/api/src/features/offerings/client.ts` and `queries.ts`;
- the web voucher/pool offering tiles and the admin voucher/pool offering views.

The missing pieces are:

- no create, item-read, update, or delete endpoint;
- no store methods or request DTO for offering writes;
- the admin's offering editor is explicitly a no-op;
- neither app has a real offering create/delete mutation;
- the shared image policy has no `offering.photo` purpose;
- storage rejects an `offering` folder because it is absent from
  `api.allowed_folders`;
- `offerings.image_url` is the one catalog image column not covered by the HTTP
  URL constraints added in migration 022;
- the current read model carries useful legacy Sarafu fields, but its free-text
  `unit` cannot safely be reused as a closed write value.

No new TanStack Start server function, Nitro route, or client-side direct call to
`clc-core` outside `@clc/api` is introduced.

## 2. Locked domain decisions

### 2.1 Voucher linkage and ownership

- An offering belongs to exactly one voucher through the existing
  `offerings.voucher_id` foreign key.
- The voucher link is immutable. Moving an offering means deleting it and
  creating another one against the intended voucher.
- A normal user may create, update, or delete offerings only for a voucher whose
  `owner_address` matches the authenticated session address, case-insensitively.
- A `SUPERADMIN` may perform the same writes for any voucher, including an
  imported voucher whose owner is not yet known.
  The admin console uses the same endpoints; it does not get a second, drifting
  CRUD API.
- `seller_address` is never accepted from JSON. New rows copy the voucher's
  `owner_address` when it exists. For an ownerless voucher, only a superadmin may
  create, and the server copies that authenticated superadmin's session address.
  This preserves the non-null provenance column without allowing
  impersonation. The row remains superadmin-managed until voucher ownership is
  corrected; once an owner is assigned, that owner gains relationship-based
  authority over the catalog.
- Authorization is decided from the locked database row in the same transaction
  as the mutation. Never authorize from a cached client voucher or a request
  field.

Imported rows whose historical `seller_address` differs from the voucher owner
remain readable. A current voucher owner or superadmin can manage them; the
historical seller cannot unless they are also the current voucher owner. This is
deliberate: in this slice, a voucher is one issuer's catalog. Multi-seller
marketplace listings—where any provider accepting a community voucher can
publish and authority follows `seller_address`—are deferred rather than being
half-enabled through imported data.

Owner delete is also a deliberate divergence from reports. Report deletion is
superadmin-only because reports are moderated public records; an offering is
issuer-owned catalog inventory, so the issuer may unlist it without operator
approval.

### 2.2 Required and optional fields

| Field           | Rule                                                               |
| --------------- | ------------------------------------------------------------------ |
| `name`          | Required after trimming; 1–120 Unicode characters.                 |
| `description`   | Required after trimming; 1–2,000 Unicode characters.               |
| `imageUrl`      | Optional HTTP(S) URL. `null` means no photo or clears it on `PUT`. |
| `pricePerUnit`  | Required positive plain decimal text; no exponent or separators.   |
| `unit`          | Required and exactly one canonical lower-case value listed below.  |
| `commodityType` | Required; exactly `GOOD` or `SERVICE`.                             |

`pricePerUnit` stays a string from form to database to response. It must not
pass through JavaScript `Number` or Go `float64`: PostgreSQL `NUMERIC` can hold
values those types silently round. It is denominated in the linked voucher, so
the UI renders `10 KSH per kg`, not a second currency selector.

The photo remains optional. Existing imported data has many rows without one,
and a missing storage deployment must not make the non-image fields impossible
to manage.

Classification is explicit. Do not infer it from the unit: a trip is usually a
service and a bag is usually a good, but rentals and bundles make such a mapping
an unrecorded business rule. The form asks “Good or service?”, sends the existing
database values `GOOD`/`SERVICE`, and the current market marker derivation remains
valid without adding a third commodity type.

### 2.3 Canonical units

The only accepted values are:

```ts
const OFFERING_UNITS = [
  "kg",
  "g",
  "litre",
  "item",
  "hour",
  "day",
  "bag",
  "unit",
  "bundle",
  "piece",
  "dozen",
  "serving",
  "trip",
  "session",
  "metre",
] as const;
```

Admin uses the requested English options:

```ts
const DEFAULT_UNIT_OPTIONS: UnitOption[] = [
  { value: "kg", label: "Kilogram" },
  { value: "g", label: "Gram" },
  { value: "litre", label: "Litre" },
  { value: "item", label: "Item" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "bag", label: "Bag" },
  { value: "unit", label: "Unit" },
  { value: "bundle", label: "Bundle" },
  { value: "piece", label: "Piece" },
  { value: "dozen", label: "Dozen" },
  { value: "serving", label: "Serving" },
  { value: "trip", label: "Trip" },
  { value: "session", label: "Session" },
  { value: "metre", label: "Metre" },
];
```

`OFFERING_UNITS` and the `OfferingUnit` type live in
`packages/core/src/features/offerings/logic.ts`. English labels do not: admin
owns the English option labels, while web builds an exhaustive translated option
list with Lingui. This keeps the platform-agnostic domain package free of
user-facing locale policy.

### 2.4 Legacy columns stay readable, but are not new stock fields

The database currently requires fields that the new product model does not ask a
provider to invent. Do not expose them in the new form. New rows use these
internal values:

| Existing column  | New-row value                                                   |
| ---------------- | --------------------------------------------------------------- |
| `commodity_name` | `name`                                                          |
| `commodity_type` | `commodityType` (`GOOD` or `SERVICE`)                           |
| `quantity`       | `1` (compatibility only; no longer rendered as available stock) |
| `frequency`      | `NULL`                                                          |
| `price`          | `pricePerUnit`                                                  |
| `available`      | `true`                                                          |
| `location_name`  | `NULL`; the linked voucher remains the location authority       |
| `geo_lat/lng`    | `NULL`                                                          |
| `image_url`      | `imageUrl`                                                      |

Existing `quantity`, `frequency`, tags, seller provenance, and raw unit remain in
the read response and database. Imported rows continue displaying their actual
quantity/frequency and raw unit; the new write UI simply does not invite an
issuer to manufacture stock data the product does not manage. For a newly
created row, `quantity = 1` is a compatibility value and must not be rendered as
“1 available”.

Because every new offering is explicitly `GOOD` or `SERVICE`, no change is
needed to the eight market classification sites (seven in `core_queries.sql`,
one in `internal/store/market_voucher_search.go`). Their dominant-type ordering
and the `kind === "voucher"` empty-result invariant remain valid.

### 2.5 Delete is an unlist, not physical destruction

`DELETE` sets `available = false` and returns the deleted id. Public voucher and
pool reads already exclude unavailable rows, and market kind/tag derivation
already reads available rows only. Keeping the record preserves Sarafu
`source_id`, timestamps, and auditability, and gives a later catalog import the
existing source row to reconcile instead of creating a duplicate. Any recurring
import must preserve a locally deleted row's `available = false` rather than
blindly restoring the source value.

There is no restore endpoint in this slice. Admin's authenticated global
offerings list remains the audit path for unavailable legacy rows.

Deleting or replacing an offering does not synchronously delete a bucket object.
Storage objects are immutable and storage-server has no delete endpoint. A later
bucket reconciler may garbage-collect unreferenced objects, but a domain request
must not gain bucket credentials or become a distributed transaction.

## 3. HTTP API contract (`../clc-core`)

Keep the resource nested under its immutable voucher relationship:

| Operation | Route                                            | Auth                       |
| --------- | ------------------------------------------------ | -------------------------- |
| List      | `GET /api/v2/vouchers/:address/offerings`        | Public; already exists     |
| Read      | `GET /api/v2/vouchers/:address/offerings/:id`    | Public                     |
| Create    | `POST /api/v2/vouchers/:address/offerings`       | User + owner or superadmin |
| Replace   | `PUT /api/v2/vouchers/:address/offerings/:id`    | User + owner or superadmin |
| Delete    | `DELETE /api/v2/vouchers/:address/offerings/:id` | User + owner or superadmin |

`GET /api/v2/pools/:address/offerings` stays as the existing relationship read.
`GET /api/v2/offerings` also stays; it is not another place to mount mutations.

The public item route filters `o.available AND v.active`, matching the public
list. An id that belongs to another voucher is `404`, not a redirect to its real
parent.

### 3.1 Request

`POST` and assign-all `PUT` accept the same body:

```json
{
  "commodityName": "Fresh maize flour",
  "commodityType": "GOOD",
  "description": "Stone-ground flour packed on collection day.",
  "imageUrl": "https://content.example/offering/9c8..._800_a3f91c2e.webp",
  "price": "120.50",
  "unit": "kg"
}
```

`imageUrl` may be `null`. Omission is normalized to `null` on `POST`; because
`PUT` is assign-all, omission also clears it. There is no PATCH endpoint and no
“preserve on omission” exception.

The HTTP write uses the established offering wire names. `@clc/api` maps the app
model's `name`, `commodityType`, and `pricePerUnit` to `commodityName`,
`commodityType`, and `price` in this body. Keeping one wire vocabulary means the
new item/mutation responses can reuse the existing offering projection instead
of creating a second representation.

Normalize surrounding whitespace once in the handler. Reject blank names and
descriptions after normalization. Accept `price` only when it matches a plain
decimal and is greater than zero; preserve the submitted decimal text via
`NUMERIC`, and return PostgreSQL's `::TEXT` representation. Reject any
`commodityType` other than `GOOD` or `SERVICE`.

### 3.2 Response

Create returns `201`; read and update return `200`:

```json
{
  "ok": true,
  "result": {
    "offering": {
      "id": "2042",
      "voucherId": "88",
      "voucherAddress": "0x...",
      "voucherName": "Kilifi Voucher",
      "voucherSymbol": "KLV",
      "voucherDecimals": 6,
      "commodityName": "Fresh maize flour",
      "commodityType": "GOOD",
      "description": "Stone-ground flour packed on collection day.",
      "imageUrl": "https://content.example/offering/9c8..._800_a3f91c2e.webp",
      "price": "120.50",
      "unit": "kg",
      "createdAt": "2026-08-21T09:00:00Z",
      "updatedAt": "2026-08-21T09:00:00Z"
    }
  }
}
```

Delete follows the existing report-delete envelope and returns `200`:

```json
{ "ok": true, "result": { "id": "2042" } }
```

There are no read aliases and no response-key rollout. List, item, and mutation
read-back all retain the existing backend wire shape (`commodityName`,
`commodityType`, `price`, raw `unit`, quantity/frequency, and provenance). The
shared client alone exposes cleaner app names. An old service-worker-controlled
web bundle can therefore outlive the backend deploy without losing fields it
still reads.

### 3.3 Error behavior

| Status | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| `400`  | malformed id/address, invalid type/unit/decimal/URL, blank/long text   |
| `401`  | no valid user session                                                  |
| `403`  | signed-in caller is neither voucher owner nor superadmin               |
| `404`  | voucher missing, offering missing/deleted, or offering-parent mismatch |
| `409`  | voucher is inactive                                                    |

Validation failures use the existing `E04` envelope. Database constraint
failures must not leak SQL or be returned as `500` when they correspond to a
caller-fixable unit, URL, or decimal error.

### 3.4 Route placement

- Keep the list and new item `GET` on the root public market router with
  `marketRateLimitMiddleware()` and `setMarketCacheHeaders`.
- Mount `POST`, `PUT`, and `DELETE` on `apiGroup` with `requireUserAuth()`.
  The handler performs the owner/superadmin authorization after middleware has
  established the caller address and role.
- Do not put the writes under `/api/v2/admin`; normal voucher owners need the
  same capability and duplicated handlers would drift.
- Mutation responses use `Cache-Control: no-store`.

## 4. Database and store work (`../clc-core`)

Add `023_offering_crud.sql` and fold the final shape into `001_init.sql` for fresh
databases, following the migration parity tests.

### 4.1 Migration

Before deploying the migration, measure the legacy values that migration 022 did
not cover and record the staging result:

```sql
SELECT count(*) AS non_http_offering_images
FROM offerings
WHERE image_url IS NOT NULL
  AND image_url !~* '^https?://';
```

A `NOT VALID` check is unsafe here. PostgreSQL re-evaluates a check constraint
on every row update, so a grandfathered data URI would make an unrelated price
edit or `SET available = false` fail. Migration 023 must clean the invalid legacy
values first, even when the precheck returned zero in another environment:

```sql
UPDATE offerings
SET image_url = NULL
WHERE image_url IS NOT NULL
  AND image_url !~* '^https?://';
```

The photo is optional and an embedded legacy value is not a durable bucket URL,
so clearing it is preferable to leaving an offering that cannot be edited or
unlisted. The recorded count makes that data change observable.

1. Create an `offering_unit(value TEXT PRIMARY KEY)` lookup and seed all 15
   canonical unit values.
2. Add `offerings_unit_fk` from `offerings.unit` to the lookup as `NOT VALID`.
   Existing imported values such as arbitrary free text survive; every new or
   changed unit is constrained. Do not destructively coerce unknown legacy units.
3. After the cleanup, add `offerings_image_url_http` normally—not `NOT VALID`—as
   `CHECK (image_url IS NULL OR image_url ~* '^https?://')`. The migration must
   finish with the constraint validated over every row.
4. Keep `price`, `unit`, and `image_url` as the physical columns. The cleaner
   app-facing names are a shared-client mapping, not a reason to rewrite the
   table or backend wire.
5. Keep the existing `commodity_type` lookup unchanged: `GOOD` and `SERVICE` are
   the required write values and no third classification is added.
6. Keep the existing timestamp trigger; an update or soft delete must advance
   `updated_at`.

The baseline migration must contain the unit lookup values, unit foreign key,
and image constraint in final table order. Extend
`migrations/migrations_test.go` to prove fresh and upgraded schemas agree and
that `023` is included in the ordered migration set.

### 4.2 Store statements

Add named statements and typed methods for:

- `get-voucher-offering`: public projection by voucher address + offering id,
  filtering active/available;
- `lock-voucher-for-offering-create`: voucher id, owner, and active status with
  a row lock;
- `lock-offering-voucher-owner`: offering id + parent address + owner and
  availability with `FOR UPDATE OF o`;
- `create-offering`: insert the six mapped product fields plus the locked
  compatibility values;
- `update-offering`: update only name, classification, description, image URL,
  price, and unit;
- `delete-offering`: set `available = false` and return the id.

Reuse the existing full offering projection and `store.Offering` JSON shape for
item and mutation read-back. Do not add `name`/`pricePerUnit` aliases to the nine
existing list statements (`list-offerings*`, `list-voucher-offerings*`, and
`list-pool-offerings*`); the shared TypeScript normalizer owns those app-facing
names. Writes read back the complete saved representation inside the same
transaction, so clients do not refetch to discover how a decimal or trimmed
value was stored.

### 4.3 Handler transaction order

For create:

1. bind and validate request shape;
2. begin transaction;
3. lock voucher and read owner/active state;
4. authorize caller;
5. insert with `voucher_id` and server-selected seller (voucher owner, or the
   authenticated superadmin for an ownerless voucher);
6. read the complete saved wire row;
7. commit; return `201`.

For update/delete:

1. parse address and positive id, then bind/validate update body if present;
2. begin transaction;
3. lock the offering joined to the named voucher;
4. return `404` for a missing, moved, or already deleted row;
5. authorize from locked voucher owner + caller role;
6. update or soft-delete;
7. read back for update, commit, and respond.

Database-backed existence checks follow authorization where doing otherwise
would disclose non-public state. The public list already reveals active
offerings, so the parent voucher address itself is not secret.

## 5. Photo storage (`~/ge/storage-server` and `@clc/api`)

### 5.1 Dedicated folder and object key

Add one semantic image purpose:

```ts
"offering.photo": { folder: "offering", width: 800 }
```

Use no forced aspect ratio. A product photograph is content, like a report
image, and cropping it to the square admin card would discard pixels that the
mobile detail view can show. `800` px covers a 430 px phone at high density and
the desktop admin card without paying the 1280 px report/banner cost.

That choice trades uniform edge-to-edge thumbnails for preserving the selected
photo. Make the trade visible before upload: the offering upload preview uses
the same square frame as `VoucherOfferingCard`, and both render the whole image
with `object-contain` on a muted background. Do not preview the full source and
then silently crop it with the card's current `object-cover`. Mobile browse tiles
may use a cosmetic crop for density, but the offering detail view must show the
whole photo.

The stored object is therefore:

```text
<bucket>/offering/<uploadId>_<actualWidth>_<contentHash>.<extension>
<cdn_base_url>/offering/<uploadId>_<actualWidth>_<contentHash>.<extension>
```

The voucher relationship does **not** come from the object path. It comes from
`offerings.voucher_id`; using a random upload id keeps retries idempotent and
allows upload-before-create, when no offering id exists yet. Do not put a voucher
address or user-authored name into the key.

### 5.2 Storage-server changes

- Add `offering` to checked-in `api.allowed_folders`.
- Update every staging/production `STORAGE_API__ALLOWED_FOLDERS` override too;
  an environment list replaces the checked-in list rather than extending it.
- Extend the folder wiring test to post with `folder=offering` and assert the
  stored path is exactly `offering`.
- Update README defaults and object-key examples.
- No S3/minio code change is needed: the existing uploader already prefixes the
  object with the validated folder.

Deploy this allowlist before either app can send `offering.photo`; otherwise
every photo selection deterministically fails with `400 INVALID_FOLDER`.

### 5.3 Shared client changes

In `packages/api/src/features/images/policy.ts`:

- add `"offering.photo"` to `ImagePurpose`;
- add `"offering"` to the folder union;
- add the 800 px, no-crop policy;
- extend the request-shape test to assert folder `offering` and width `800`.

Reuse `uploadImageMutationOptions`, the in-memory storage token, retry identity,
file type/size checks, and the existing upload error taxonomy. Do not add a
second multipart client.

The save sequence is always:

```text
select file -> validate -> upload to offering/ -> receive URL
-> POST/PUT offering with that URL -> update Query cache
```

If upload succeeds but the offering write fails, keep the returned URL in the
open form so Retry does not upload the same photo again. Closing the form may
leave an orphan object; that is acceptable until a bucket reconciler exists.

## 6. Shared domain and API client (`clc-app/packages`)

### 6.1 Domain schema

Create `packages/core/src/features/offerings/logic.ts` with:

- `OFFERING_UNITS`, `OfferingUnit`, and the existing two-value
  `OfferingCommodityType` (`GOOD`/`SERVICE`);
- a zod 4 `offeringWriteSchema` for the six editable fields;
- pure normalization for trimmed name/description and decimal text;
- no display formatter duplicated from the market feature.

The schema contains no `File` and no hooks. A browser `File` stays beside form
state until storage returns an URL.

`formatOfferingPrice`, `formatOfferingQuantity`, and `formatOfferingTotal`
already live in `packages/core/src/features/market/logic.ts` with precision tests.
Leave them there and update callers to pass the app model's `pricePerUnit` and
legacy display quantity. Do not create a second amount formatter.

### 6.2 Offerings client

Extend `packages/api/src/features/offerings/client.ts` with:

```ts
getVoucherOffering(voucherAddress, id, signal);
createVoucherOffering(voucherAddress, input, signal);
updateVoucherOffering(voucherAddress, id, input, signal);
deleteVoucherOffering(voucherAddress, id, signal);
```

Preserve the client's existing `cache`/`CreateClcApiOptions.catalogCache`
policy. Extend `getVoucherOfferings` with a per-read cache override (or an
equivalent dedicated managed-read method) so the web app can request
`cache: "no-store"` only for an owner's management query. The admin app already
constructs its catalog client with `catalogCache: "no-store"`; guest web reads
must continue to use the default HTTP cache.

The exported `Offering` model maps the stable backend wire to app-facing fields:

```ts
type Offering = {
  // existing identity, voucher, provenance, quantity/frequency, availability,
  // location, tag, and timestamp fields remain
  name: string; // backend commodityName
  commodityType: "GOOD" | "SERVICE";
  pricePerUnit: string | null; // backend price
  unit: OfferingUnit | null; // safe value for a write form
  unitLabel: string | null; // untouched trimmed backend unit for display
};
```

For a canonical unit, `unit` and `unitLabel` carry the same value. For a legacy
free-text unit such as `50kg sack`, `unit` is `null` while `unitLabel` preserves
`50kg sack`. Read surfaces use `unitLabel`; edit surfaces require choosing a
canonical `unit` before saving. Keep existing quantity/frequency display for
imported rows. Newly created rows do not render their compatibility
`quantity = 1` as stock.

Mutations use cookies through the normal `HttpClient`, never the storage bearer
token. Only the multipart upload goes to storage-server.

### 6.3 Query keys and cache writes

Add `offeringKeys.detail(voucherAddress, id)` and first regularize voucher keys
around a real common prefix:

```ts
voucherRoot: (address) => ["clc", "offerings", "voucher", lower(address)],
byVoucher: (address, perPage) => [...voucherRoot(address), "page", perPage],
byVoucherInfinite: (address, perPage) => [
  ...voucherRoot(address),
  "infinite",
  perPage,
],
byVoucherManaged: (address, perPage) => [
  ...voucherRoot(address),
  "managed",
  "page",
  perPage,
],
byVoucherManagedInfinite: (address, perPage) => [
  ...voucherRoot(address),
  "managed",
  "infinite",
  perPage,
],
```

The current finite and infinite keys put the address at different indexes and
cannot be found safely with one prefix. Changing in-memory query identity during
this feature is safe; query data is not persisted as domain state.

Owner/admin management reads use the same public URL with Fetch
`cache: "no-store"` and the managed keys. Guest/read-only surfaces retain the
existing public `max-age=60` request. This prevents an owner from deleting an
offering, refetching, and receiving the pre-mutation browser-cache body. Do not
switch the web app's whole catalog client to no-store: the override belongs only
to the owner-management offering query.

After a successful create/update:

- seed the exact detail key with the returned offering;
- call `queryClient.getQueryCache().findAll({ predicate })`, where the predicate
  uses a tested `isVoucherOfferingListKey(query.queryKey, address)` guard, and
  patch every finite/infinite, public/managed list shape for that voucher;
- treat that exhaustive patch as authoritative. Do **not** immediately invalidate
  the same voucher-root queries—the public HTTP cache can still hold the old body
  for 60 seconds;
- invalidate `poolKeys.all`, because a pool composed from this voucher has a
  changed offering list;
- invalidate `voucherKeys.all`, because market kind and offering-derived facets
  can change.

After delete, remove the exact detail query and remove the id from every cached
offering page, then perform the same invalidations. Do not optimistically mutate
before the server authorizes the write.

Implement finite/infinite patching once as tested pure cache helpers. Tests must
enumerate every key factory under `voucherRoot`, so adding a new shape without
teaching the patcher fails a test rather than falling through to a stale
invalidation. Do not copy offering query data into Zustand.

## 7. Admin console

Replace only the offering branch of
`apps/admin/src/features/vouchers/ui/edit-voucher-sheet.tsx` with a real
TanStack Form surface (or a dedicated `offering-editor-sheet.tsx`). The voucher
branch is already live on this branch: it relays
`PUT /api/v2/admin/vouchers/:address/profile` through
`useUpdateVoucherProfile`. Do not describe or rebuild it as a no-op.

Required behavior:

- “Add offering” in the voucher offerings panel header;
- create and edit share the same six-field form;
- name input, description textarea, decimal price input (`inputMode="decimal"`),
  a required Good/Service selector, and a unit select/combobox using
  `DEFAULT_UNIT_OPTIONS`;
- `ImageUploadField` labelled “Photo” with `purpose="offering.photo"`;
- square `object-contain` photo preview matching the admin offering card, plus
  replace and clear;
- submit disabled while either photo upload or domain mutation is pending;
- field errors always go through `getFieldError(...)`;
- a destructive delete action with an explicit confirmation dialog;
- upload errors keep the form open; domain errors keep the already uploaded URL;
- success closes the sheet and shows a Sonner confirmation.

Extend `ImageUploadField` with a small pending-state callback if necessary. The
parent form must know an upload is in flight; otherwise Save can race selection
and persist the previous/null URL.

Admin is English-only. Do not introduce Lingui. Retain square corners, flat
surfaces, and the existing responsive card grid.

Quantity, frequency, location, seller, and tags must not remain editable under a
second legacy form. `commodityType` does remain, reduced to the required
Good/Service selector. The card displays the new name and
`{price} {symbol} / {unit}` while retaining imported quantity/frequency as
read-only context. Historical seller provenance may remain in an audit detail,
but it is not an authority field for this CRUD form.

## 8. Mobile web app

The member app is where a voucher owner should manage their own offerings; API
authorization without a user surface would leave the feature admin-only.

Before building this surface, measure whether it would be usable on staging:

```sql
SELECT
    CASE WHEN platform_contract_id IS NULL THEN 'imported' ELSE 'clc-deployed' END AS origin,
    COUNT(*) AS active_vouchers,
    COUNT(*) FILTER (WHERE owner_address IS NULL) AS owner_missing,
    COUNT(*) FILTER (WHERE owner_address IS NOT NULL) AS owner_present
FROM vouchers
WHERE active
GROUP BY origin
ORDER BY origin;
```

Every active CLC-deployed voucher must have an owner before self-service ships;
otherwise fix deploy promotion/backfill first. Record imported-owner coverage as
the feature's measured reach. If the vouchers intended for this slice are mostly
ownerless, defer the web management UI and ship backend/admin CRUD first rather
than presenting controls almost nobody can use. A superadmin can still create
for an ownerless imported voucher under §2.1, but that does not make the member
self-service surface useful.

- On the voucher Offerings tab, compare `useAuthStatus().session.address` with
  `voucher.ownerAddress` case-insensitively. Do not use the wagmi connector
  `address`; `useAuthStatus` exposes both and a connector can diverge from the
  backend session that authorizes the HTTP write.
- Read `active` from the voucher detail already held by the screen before
  selecting an offerings state. When `active === false`, do not show the normal
  empty-offerings message or any add/edit/delete controls. Render a translated,
  flat state explaining “This voucher is retired. Offerings can no longer be
  managed.” and disable the managed offerings query. The API's `409` remains the
  defensive answer for a stale client or a retire/create race, not the primary
  UX.
- Owners get an “Add offering” action plus edit/delete controls for that
  voucher's rows. Other visitors retain the existing buying/detail surface.
- Owners use the managed `cache: "no-store"` offering query. The public
  `kind === "voucher"` shortcut may remain for guests, but must not suppress the
  owner-management query or its post-create cache state.
- Use a bottom sheet for create/edit, not a page-level card or centered modal.
- Reuse the shared zod schema and upload mutation; use a local `File`/preview in
  form state and persist only the URL.
- Use a translated, exhaustive unit label switch/list. Issuer-authored name and
  description are displayed verbatim and never translated.
- Render price as a whole Lingui message equivalent to
  `{price} {voucherSymbol} per {unit}` and retain exact decimal arithmetic for
  totals.
- Preserve the shared `OfferingsPanel` as a read component by passing optional
  management actions rather than importing voucher-owner hooks into the pool
  offering view.

Follow mobile constraints: full-width flow, `bg-card` controls on the gray page,
`h-11` primary CTAs, `h-9` inputs, and `rounded-none` on web primitives. After
adding or changing copy, run `pnpm i18n:extract` and fill all new non-English
`msgstr` entries.

## 9. Tests

### 9.1 `storage-server`

- `offering` is accepted and stored under exactly that folder;
- a non-allowlisted folder is still rejected;
- retrying the same offering upload id produces the same object key;
- README/config tests expect five allowed folders.

Run `go test ./...` in `~/ge/storage-server`.

### 9.2 `clc-core`

Migration/store tests:

- fresh and upgraded schemas both contain all 15 unit rows, the unit FK, and the
  offering image URL check, while the commodity type lookup remains exactly
  `GOOD`/`SERVICE`;
- legacy unknown/null units survive the migration;
- legacy non-HTTP image URLs are counted, cleared to `NULL`, and the image check
  is validated rather than left `NOT VALID`;
- a row that formerly held a data URI can still be edited and soft-deleted after
  migration;
- a new invalid unit and non-HTTP image are rejected;
- create links the exact voucher id, copies its owner to seller, applies internal
  compatibility defaults, and returns decimal text unchanged;
- superadmin create on an ownerless voucher copies the authenticated session
  address to seller; a normal user cannot create there;
- update cannot change voucher id/seller/internal compatibility fields;
- delete sets `available=false`, advances `updated_at`, and removes the row from
  voucher/pool/market derivations without physically deleting it.

Handler tests:

- public list and item GET work without a cookie and never expose unavailable or
  inactive rows;
- create is `201`, update/read are `200`, delete is `200` with the id;
- no session is `401`; service auth is `403` through `requireUserAuth`;
- owner succeeds regardless of address casing;
- a different user gets `403`; superadmin succeeds;
- an inactive voucher gets `409`;
- a mismatched voucher-address/id pair and already-deleted id get `404`;
- seller/voucher ids in a JSON body are ignored or rejected, never trusted;
- all invalid unit, decimal, blank/long text, and URL cases are `400`;
- mutation responses are `no-store`; public reads retain market cache headers.

Run the repository's normal Go checks; do not couple deployment of these handlers
to a `clc-app` build.

### 9.3 `clc-app`

Core/API tests:

- exact 15-value unit enum, two-value commodity type enum, and schema boundaries;
- decimals larger than `Number.MAX_SAFE_INTEGER` survive unchanged;
- the stable backend `commodityName`/`price` wire maps to app-facing
  `name`/`pricePerUnit` without response aliases;
- unknown legacy units produce `unit: null` while preserving their exact trimmed
  display text in `unitLabel`;
- all four missing client methods build the correct nested URL/method/body;
- photo upload sends `folder=offering`, `width=800`, and no manual multipart
  `Content-Type`;
- cache helpers discover and insert/update/remove a row in every public/managed,
  finite/infinite key under one voucher root without altering another voucher's
  pages;
- managed offering reads set Fetch `cache: "no-store"`, while public guest reads
  retain their existing cache behavior.

Admin tests:

- Add opens an empty form; Edit opens the selected offering;
- all six fields submit, including explicit `GOOD`/`SERVICE`, the exact selected
  unit, and the returned image URL;
- Save cannot race an in-flight upload;
- upload/domain failures retain entered values and uploaded URL respectively;
- delete confirmation calls the nested endpoint and removes the card;
- invalid fields show normalized TanStack Form errors;
- legacy unknown units force a valid selection before save;
- rectangular photos use the square `object-contain` preview instead of being
  silently cropped.

Web tests:

- voucher owners see management actions; another signed-in user and a guest do
  not;
- ownership is derived from `useAuthStatus().session.address`, even when the
  connected wagmi address differs;
- `kind === "voucher"` may suppress the guest read but never the owner's managed
  offering query;
- a retired voucher shows the explanatory retired state, hides write controls,
  and does not issue the managed offerings read or a create request;
- create/edit/delete update the visible tab immediately;
- mobile form uses the translated unit labels and correct image purpose;
- pool offering screens remain read-only;
- new Lingui strings exist in every catalog.

Then run from `clc-app`:

```sh
pnpm i18n:extract # only when web copy changes; fill translations afterwards
vp check
vp test
```

Do not auto-run `vp build`.

## 10. Delivery order

1. **Storage first:** allow `offering`, test it, deploy it to staging and verify a
   real upload URL begins with the staging CDN's `/offering/` path.
2. **Database/backend:** run and record the non-HTTP offering-image precheck,
   then ship migration 023's cleanup and validated constraint, item read, and
   owner-or-superadmin-authorized create/update/delete using the stable offering
   response wire. Deploy before exposing any client mutation.
3. **Shared client/domain:** unit schema, image purpose, CRUD methods, query key,
   and cache helpers.
4. **Admin CRUD:** replace the offering branch's current no-op, add
   create/delete, and dogfood as superadmin against staging.
5. **Ownership gate:** run and record the staging query in §8. Backfill active
   CLC-deployed vouchers if needed; defer member self-service if intended
   imported vouchers are still predominantly ownerless.
6. **Web owner CRUD:** when the ownership gate passes, add owner-only controls,
   bypass the guest known-empty shortcut for the managed query, extract/fill
   catalogs, and test at 360–430 px.
7. **Rollout check:** create, edit, replace photo, clear photo, and delete one
   offering; verify the voucher view, every pool containing it, market marker
   derivation, and admin view converge.
8. **Compatibility policy:** keep the existing v2
   `commodityName`/`commodityType`/`price` wire stable. If a later API version
   renames it, use a versioned endpoint and retire the old representation only
   after the previous service-worker-controlled web bundle has aged out (or a
   forced-update/telemetry policy proves it is gone). Quantity/frequency and
   provenance remain readable compatibility data, not cleanup targets in this
   feature.

## 11. Acceptance checklist

- [ ] An offering is linked to one immutable voucher foreign key.
- [ ] Name, description, optional photo, positive price per unit, one of the 15
      units, and explicit Good/Service classification are the only editable
      fields.
- [ ] `POST`, public item/list `GET`, assign-all `PUT`, and soft `DELETE` exist
      and return the documented envelopes.
- [ ] Normal users can mutate only vouchers they own; superadmins can manage any
      voucher; seller and voucher ids never come from JSON. Ownerless
      superadmin-created rows attribute seller to the authenticated session.
- [ ] Offering photos upload to `offering/` at width 800 in every environment,
      using the existing authenticated direct-upload pipeline.
- [ ] The URL returned by storage is the URL persisted by `clc-core`; image bytes
      never pass through the backend/database.
- [ ] New writes reject non-HTTP image URLs and unknown unit values at both API
      and database boundaries.
- [ ] Legacy non-HTTP offering images are measured and cleared before a fully
      validated image URL constraint is added; their rows remain editable and
      soft-deletable.
- [ ] Decimal price text is never rounded through `Number`/`float64`.
- [ ] Delete removes an offering from public voucher/pool/market results while
      retaining its audit row and leaving immutable bucket cleanup asynchronous.
- [ ] Every new offering is explicitly classified as `GOOD` or `SERVICE`; no
      `UNCLASSIFIED` value or market tie-break change is introduced.
- [ ] Managed reads bypass the browser HTTP cache, every voucher query shape is
      patched immediately, and pool/market dependents are invalidated.
- [ ] Legacy free-text units and imported quantity/frequency remain visible on
      read surfaces without becoming unrestricted write fields.
- [ ] Admin's offering no-op is gone; create, edit, photo replace/clear, and
      delete are functional, with non-cropping previews.
- [ ] Voucher owners have the same CRUD capability in the mobile app; guests and
      non-owners remain read-only.
- [ ] A retired voucher renders an explanatory state with no management query or
      write controls instead of looking like an active voucher with no offerings.
- [ ] The staging ownership precheck is recorded and the member surface ships
      only for a voucher population it can actually authorize.
- [ ] The backend wire remains compatible with a previous PWA bundle that may
      outlive this deployment.
- [ ] Storage/backend tests, `vp check`, and `vp test` pass, and all new web copy
      is present in every Lingui catalog.
