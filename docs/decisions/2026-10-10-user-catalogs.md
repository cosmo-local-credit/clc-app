# User-created catalogs

Status: accepted. Date: 2026-10-10.

Catalogs curate existing public pools and vouchers in PostgreSQL. They do not
create or change any blockchain state. Adding a pool writes one pool relationship;
explicit voucher relationships remain independent when pools are added, removed,
or change their own voucher membership.

The backend owns authorization, public visibility, resource eligibility and the
one-catalog-per-owner constraint. Separate foreign-key join tables prevent orphan
members and make repeated adds/removals idempotent. A future multiple-catalog
release can remove the owner uniqueness constraint and add a chooser without
changing stable catalog IDs or member identities.

`features/catalogs` names the new feature in the frontend; existing singular
`features/catalog` remains the general directory/filter domain. Pure schemas
live in `@clc/core`, HTTP clients and cache options in `@clc/api`, shared controls
in web `components/catalogs`, and screen implementations in web feature UI.
Routes are thin; catalog discovery/detail use the navigation shell, while creation
is a focused authenticated screen. Owner editing reuses the existing bottom sheet.

Each catalog stores its own location. Authenticated discovery uses the backend
session's saved profile origin and the established 1,000 km radius. The nearby
cache key includes the account, origin and radius. Missing locations prompt for
profile editing; profile/session failures offer retry. Guests receive ordinary
public discovery with no invented distance. Public detail links are stable across
renames and do not require membership in the discovery radius.

Catalog image uploads reuse `ImageUploadField` and the existing `profile` storage
folder with a square 800 px policy. Persist the returned absolute image URL;
clearing sends an empty string. There is no new storage service configuration.

Create-first navigation accepts only a validated pool/voucher resource ID and
address, never an arbitrary return URL. If creation succeeds but adding fails,
retain the saved catalog and retry just the member write. Account-scoped query
keys isolate My catalog and membership data; writes refresh discovery, counts,
and member pages. Native sharing uses the stable public detail URL, with a fresh
Copy link tap after a native-share failure.

See [[catalogs-plan]] for the complete scope, API contract and verification.
