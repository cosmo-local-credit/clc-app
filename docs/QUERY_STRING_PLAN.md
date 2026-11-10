# Query-string prefill for voucher and pool creation

A link can open voucher or pool creation with its fields already filled in, for
external integrations and migrations. The person still lands on step 1, walks
the normal steps, reviews, accepts the terms and publishes. Nothing deploys,
signs or advances because of a link.

Images in a link are downloaded by storage-server, and only from source hosts
on a single allowlist kept for migrations.

## Decisions

- The prefill travels in typed search params on the step-1 URL
  (`/vouchers/create/voucher`, `/pools/create/pool`). The route's
  `validateSearch` parses it, and it seeds the form's default values. That is
  the whole path.
- It does not go through zustand. `useVoucherCreateDraft` /
  `usePoolCreateDraft` hold a submitted-value retry snapshot, and
  `#/lib/view-drafts` is a phone/desktop swap bridge that deliberately refuses
  to be a saved draft. Neither is a prefill store. React Query is not involved
  until phase 4.
- The prefill schemas live in `@clc/core`, one per resource:
  `features/vouchers/prefill.ts` and `features/pools/prefill.ts`. They are pure
  zod, so admin or a future native app can reuse them.
- Each field is validated on its own by the same schema its create form uses.
  An invalid field drops itself; the rest of the link still applies.
- The client never writes an external URL into `iconUrl` or `imageUrl`. Those
  fields only ever hold a URL that storage-server returned.
- The allowlist of image source hosts lives in one place, storage-server's
  config. The client does not mirror it.
- Never prefilled: `acceptedTerms`, `feeAddress`, the owner (always the
  connected wallet), `email`, `phone`, and the fields the voucher form fixes
  itself (`voucherType`, `expiryDate`, `decimals`).
  - `feeAddress` is excluded because a link could otherwise send a steward's
    pool fees to a stranger. It keeps today's behaviour: seeded to the
    connected wallet when the fee goes above zero.
  - Email and phone are excluded because a URL ends up in history, logs and
    chat previews, and the profile prefill already supplies both.

## URL contract, v1

Rules shared by both resources:

- `v=1` is required. A missing or unknown version ignores the whole prefill.
- Param names are the form's field names, so there is no translation layer.
  Location is flattened, and images take a source URL (see below).
- Location is all of `locationName`, `lat`, `lng`, `country` (ISO 3166-1
  alpha-2), or none of them. Fractional coordinates are the normal case.
- `tags` is comma separated, trimmed, with empties and duplicates dropped, and
  normalized the same way as the tag input. More than 12 tags drops the field.
- `terms` accepts an http(s) URL only, never terms text. Terms text may run to
  5,000 characters, which cannot fit the size budget below.

### Encoding

The router's default search parser runs `JSON.parse` on every value before
`validateSearch` sees it, and that is lossy: `supply=9007199254740993.000001`
arrives as the number `9007199254740994`, `price=1.50` as `1.5`, `name=null`
as `null`. No schema can recover the lost digits afterwards.

- The encoding is the router's own `stringifySearch`, applied to typed values.
  Every field except `v`, `lat`, `lng` and `feesDecoupled` is a string field.
  - A string field's value is JSON-quoted before percent-encoding when
    `JSON.parse` would accept it (a number, `true`, `false`, `null`, or a
    complete JSON string, array or object). `price=%2250%22` reaches the schema
    as `"50"`. Text that `JSON.parse` rejects (`Mama Mboga`, `food,vegetables`,
    a URL) is sent as is.
  - `v`, `lat`, `lng` and `feesDecoupled` are written bare, the way
    `stringifySearch` writes a number or a boolean: `v=1`, `lat=-1.3133`,
    `feesDecoupled=true`.
- String fields accept only strings. A number, boolean or null in a string
  field drops that field, because it may already have lost digits or zeros.
- The non-string fields accept their type, and their quoted form too, since
  nothing is lost either way: `v` is `1` or `"1"`, `lat` and `lng` a number or
  a numeric string, `feesDecoupled` `true` or `false`, bare or quoted. The form
  stores coordinates as numbers, and double precision is far finer than a
  coordinate needs.
- `validateSearch` returns each accepted param in its wire form, not the form
  value. On mount the router rewrites the URL with `validateSearch`'s output
  merged over the parsed search, re-stringified, so returning a parsed array or
  number would change the link a reload sees. Keys it omits are not removed:
  `router-core` merges `{ ...parsed, ...validated }` unless the router sets
  `search.strict`, which this app does not. A rejected field and any param the
  route never reads stay in the URL as they arrived.
- `@clc/core` exports the URL builders, `voucherPrefillHref(fields)` and
  `poolPrefillHref(fields)`. They apply this encoding, check the size budget and
  throw over it. Core cannot import the router, so the builder reimplements the
  quoting rule, and a test in `apps/web` checks it against the router's
  `defaultParseSearch`. An integration in another language follows the same
  rules: quote a string field's value when `JSON.parse` would accept it, write
  `v`, `lat`, `lng` and `feesDecoupled` bare, then form-encode the result
  (`URLSearchParams`, so a space is `+`).

### Size budget

The link may be at most 4,096 bytes, measured on the whole URL after the
router's rewrite: `pathname + searchStr + hash`, the exact string
`useReturnDestination` hands to the onboarding redirect. One function builds
that string for both, so the measure and the redirect cannot drift, and one
constant in `@clc/core` holds the limit for the builders, the prefill hooks and
the redirect.

- Everything in that string counts, not only the accepted fields. The router
  keeps params `validateSearch` omits (see Encoding), so a link whose accepted
  fields take 24 bytes can still carry a rejected field or an unrelated param
  of 6 KB, and that tail is what the redirect re-encodes. Measuring the
  accepted params alone would pass it.
- A signed-out person goes through `/onboarding?step=welcome&redirect=…`, and
  the router encodes the path and query from `useReturnDestination` once more
  as a query value. An unreserved byte stays one byte, a `%XX` escape becomes
  `%25XX`, and a delimiter (`&`, `=`, `,`, `/`, `:`, `?`, `+`) becomes three
  bytes. The redirect is therefore at most three times the link, 12,288 bytes
  plus origin and prefix, under Cloudflare's 16 KB URL limit.
- The budget counts encoded bytes, never characters. `sanitizeInternalRedirect`
  normalizes through `new URL`, which percent-encodes raw non-ASCII first.
- The field maximums do not fit inside it. zod's `.max` counts UTF-16 code
  units, and one code unit in most non-Latin scripts is three UTF-8 bytes,
  nine once percent-encoded. A 500-unit description in such a script is 4,500
  bytes on its own; Latin text costs about one byte a character. The budget,
  not the field caps, is the binding limit. A link that needs more is a
  phase-4 import by reference.
- A link over budget ignores the whole prefill, signed in or out. Dropping
  fields to fit would choose arbitrarily, and accepting it for a signed-in
  person would let the same link fail for a signed-out one. The builder throws
  rather than emit it.
- Ignoring the prefill does not shrink the URL, so the redirect is bounded on
  its own: `useReturnDestination` returns the pathname alone when the full
  destination is over the limit. That holds for every route behind
  `AuthenticatedRoute`, not only prefill links, and loses nothing a prefill
  link could have applied, because such a link's prefill was already ignored.
- The redirect nests the link once. Any later hop that nests a whole URL again
  must recheck this budget.

### Voucher: `/vouchers/create/voucher`

| Param                                   | Form field                   | Notes                           |
| --------------------------------------- | ---------------------------- | ------------------------------- |
| `name`                                  | `name`                       | `voucherNameSchema`             |
| `symbol`                                | `symbol`                     | Upper-cased; see Symbols below  |
| `description`                           | `description`                | `voucherDescriptionSchema`      |
| `price`                                 | `price`                      | `voucherPriceSchema`            |
| `unitOfAccount`                         | `unitOfAccount`              | `voucherUnitSchema`             |
| `supply`                                | `supply`                     | Minted on the receipt, as today |
| `locationName`, `lat`, `lng`, `country` | `location`                   | All four or none                |
| `tags`                                  | `tags`                       | Comma separated                 |
| `website`                               | `website`                    | `optionalWebsiteSchema`         |
| `terms`                                 | `terms` (`termsMode: "url"`) | URL only                        |
| `markerIcon`, `markerColor`             | `markerIcon`, `markerColor`  | Enum values                     |
| `iconSource`                            | `iconUrl`, after import      | Imported by storage-server      |

The voucher create form has no banner field today. Add `bannerSource` when it
does.

### Pool: `/pools/create/pool`

| Param                                   | Form field                   | Notes                                   |
| --------------------------------------- | ---------------------------- | --------------------------------------- |
| `name`                                  | `name`                       | `poolNameSchema`                        |
| `symbol`                                | `symbol`                     | Upper-cased; see Symbols below          |
| `description`                           | `description`                | `poolDescriptionSchema`                 |
| `unitOfAccount`                         | `unitOfAccount`              | `poolUnitSchemaForPricing` on the chain |
| `pricing`                               | `pricing`                    | `relative` / `oracle` / `decimal`       |
| `feePolicyDefault`                      | `feePolicyDefault`           | `poolSwapFeeSchema`, 0 to 100           |
| `feesDecoupled`                         | `feesDecoupled`              | Ignored when the fee is zero            |
| `locationName`, `lat`, `lng`, `country` | `location`                   | All four or none                        |
| `tags`                                  | `tags`                       | Comma separated                         |
| `website`                               | `website`                    | `optionalWebsiteSchema`                 |
| `terms`                                 | `terms` (`termsMode: "url"`) | URL only                                |
| `imageSource`                           | `imageUrl`, after import     | Imported by storage-server              |

`unitOfAccount` and `pricing` are checked together against the connected chain
(`poolCreateSchemaForChain`). Under `oracle`, a unit without a price feed falls
back to `relative`, the same as `syncPricingToUnit` does when someone types it.

### Example

As `voucherPrefillHref` emits it, wrapped for reading:

```
/vouchers/create/voucher?v=1&name=Mama+Mboga&price=%2250%22&unitOfAccount=KES
  &supply=%221000%22&locationName=Kibera&lat=-1.3133&lng=36.7876&country=KE
  &tags=food%2Cvegetables&iconSource=https%3A%2F%2Fimages.example.org%2Fv%2F123.jpg
```

## Seeding order

The forms already set their starting values in one spot:
`use-create-voucher-form.ts` and `use-create-pool-form.ts` (the `pristine`
state). The phone flow and the desktop wizard share both hooks, so one change
covers both views. Highest priority first:

1. **View draft.** A phone/desktop swap in this session is the newest typing.
2. **URL prefill.** When a link carries a prefill, it also replaces and clears
   any retry snapshot in the draft store, because the person opened a new link
   on purpose.
3. **Retry snapshot.** Today's behaviour after a failed receipt.
4. **Profile prefill.** Fills gaps only. It must skip every key the link set.
   Today the `unitOfAccount` seed compares against the default `"KES"`, so a
   link that explicitly set `KES` would be overwritten by the profile's unit.
5. **Defaults.**

**Handoff.** The view-draft bridge in both hooks clears the draft whenever the
values equal `pristine` (`use-create-voucher-form.ts:301`,
`use-create-pool-form.ts:305`). Seeding the link into `pristine` would make an
untouched prefilled form equal to it, so no draft is written. Once Next has
dropped the params, a layout switch mounts the other view with defaults, and
the step guard sends it back to an empty step 1. The bridge's baseline is
therefore the form without the link (the defaults, since a link clears the
retry snapshot), not `pristine`. A prefilled form differs from that baseline
from its first render, so the bridge saves it before any edit, and editing it
back to the defaults still clears it.

Symbols: a prefilled `symbol` is passed as `initialSymbol` to
`useSuggestedSymbol`, so it counts as chosen, not suggested. A symbol that is
taken is still swapped at publish by `suggestedSymbol.confirm`, with the
existing "Symbol was taken, using X instead" toast. A migration that expects to
keep its ticker has to read that toast.

## URL lifecycle

- The prefill is read on step 1 only. `$step` is one route for every step, so
  `/vouchers/create/review?v=1&name=…` would otherwise seed a valid name, and
  the step guard, which checks only the name, would let it stay on review.
  `beforeLoad` redirects any other step that carries `v` to step 1 with the
  same search (`replace`), before anything seeds. The hooks also ignore a
  prefill when `step` is not the first, as a second line.
- The prefill stays on the step-1 URL, so a reload seeds the same values again.
  The form keeps nothing else across a reload.
- Moving to the next step navigates with params only, which drops the prefill.
- Publishing leaves through `exitVoucherCreateHistory` /
  `exitPoolCreateHistory`. Back after a publish must not reopen a prefilled
  form.
- Signed out: `AuthenticatedRoute` carries path, search and hash into the
  onboarding redirect (`useReturnDestination`, `sanitizeInternalRedirect`). The
  person must come back to a prefilled step 1 after signing in.

## Image import

### storage-server (separate service)

- New endpoint, `POST /import` (name to confirm). It takes
  `{ url, folder, width, aspect, uploadId }`, authenticates with the same
  bearer token as `/upload`, and answers the same `{ ok, payload }` shape
  (`UploadedImage`).
- **Allowlist.** One config value per environment, for example
  `import.allowed_hosts` / `STORAGE_IMPORT__ALLOWED_HOSTS`.
  - Hostnames must match exactly; no wildcards.
  - An empty list, the default, turns import off.
  - Staging and prod are configured separately, like their buckets.
- **Fetching.**
  - https only. The host, lower-cased, in ASCII (IDNA) form and without a
    trailing dot, must be on the list.
  - The address check governs the connection itself, not a lookup made before
    it. A DNS check followed by an ordinary fetch resolves twice, and the
    second answer can be a private address. The HTTP client dials through a
    hook that resolves the host, validates the address it is about to connect
    to, and connects to that address (in Go, a `net.Dialer` `Control` function
    sees the exact address being dialled). There is no second lookup to rebind.
  - Refused, even for a host on the list: loopback, private (RFC 1918), shared
    (100.64.0.0/10), link-local (169.254.0.0/16 and fe80::/10, which hold the
    cloud metadata addresses), unique-local (fc00::/7), unspecified, multicast
    and broadcast. IPv4-mapped and NAT64 IPv6 addresses are unwrapped and
    checked as IPv4.
  - The request URL keeps the hostname, so SNI and certificate verification
    run against the hostname. Never rewrite the URL to the IP, and never skip
    verification.
  - No redirects: a 3xx is "fetch failed". If redirects are ever allowed, each
    hop is rechecked against the list and dialled through the same hook.
  - No proxy. Environment proxy settings are ignored, because a proxy makes
    the onward connection itself, out of the hook's sight.
  - Every connection goes through the hook: retries, keep-alive reconnects and
    Happy Eyeballs fallbacks included.
  - Byte cap equal to the upload cap, plus a timeout.
  - Decide the content type from the file's leading bytes, not the header, and
    accept only the types `/upload` accepts.
  - Run the output through the same resize and re-encode pipeline as `/upload`,
    which also strips metadata.
- **Cropping.** storage-server never crops; today the client crops before
  upload. An import has nobody to frame it, so the server centre-crops to the
  requested `aspect` (1:1 icon or logo, 16:9 banner). The person can replace
  the image in the form.
- **Idempotency.** The client derives `uploadId` from a hash of the source URL.
  Reloading a prefilled link then lands on the same object
  (`<folder>/<uploadId>_<width>_<contentHash>.<ext>`) rather than a new one.
- **Errors.** Distinct codes for host not allowed, fetch failed and content
  rejected. They map to `StorageErrorKind` `rejected` / `network` / `rejected`.
- Rate limit per identity.

The import belongs in storage-server, not clc-core: storage-server owns the
folders, widths and the image pipeline. clc-core only checks that the stored URL
is http(s).

### clc-app

- In `@clc/api/features/images`: add an `import` method on the storage client
  and `importImageMutationOptions`, reusing upload's token read and its single
  re-read on a 401. Its `mutationKey` is
  `["images", "import", purpose, uploadId]`, and it takes the purpose's
  folder, width and aspect from `IMAGE_POLICIES`.
- `iconSource` / `imageSource` are honoured only when `isStorageConfigured`.
  They count as setting `iconUrl` / `imageUrl` for the profile prefill, so the
  profile photo never lands while an import is pending.

The pending import is form state, not component state. A form-only field,
`iconImport` / `imageImport`, holds the `uploadId` the form is waiting for, or
`null`. The link seeds it with the rest of the prefill, so it rides the view
draft across a layout switch the way `termsMode` does.

- **Firing.** A mounted form whose `iconImport` is set fires the import unless a
  mutation with that key is already pending or has succeeded
  (`useMutationState`). A layout switch while it runs joins the running import
  instead of starting a second one.
- **Completion.** The mounted form applies a result only while `iconImport`
  still equals its `uploadId`: it writes the URL into `iconUrl`, so the preview
  shows the stored image, and sets `iconImport` to `null`. It reads the result
  through `useMutationState`, not a `mutate` callback, which dies with the view
  that fired it.
- **The person's choice wins.** An upload starting, a finished upload, or a
  removal sets `iconImport` to `null` first. A late completion then matches
  nothing and is dropped; its stored object is orphaned like an abandoned
  upload.
- **Failure.** Only while `iconImport` still matches: the field stays empty,
  shows a field-level error ("Couldn't import the image"), and `iconImport`
  becomes `null`. Never fall back to the source URL.
- **Busy.** Two sources, never one setter. `ImageUploadField` reports its own
  state through `onBusyChange`, including `false` as soon as it mounts
  (`image-upload-field.tsx:79`), so a shared setter would drop an import's
  block the moment the place step renders. The field keeps `uploadBusy`; the
  import is pending while `iconImport` is set. Next on the place step and
  publish wait on both.
- Run `pnpm i18n:extract` for the new strings and fill every non-English
  catalog.

## Steward approve prefill (phase 3)

```
/pools/$poolAddress?tab=vouchers&tool=approve&candidate=0x…
  &exchangeRate=%221%22&creditLimit=%22500%22
```

- **One param for both views.** Desktop already opens the approve panel with
  `tool=approve` (`pool-side-state.ts`). The phone sheet's open state is local
  today (`approving` in `pool-detail-page.tsx`) and moves to the same param, so
  one link opens either view. `parsePoolSideRequest` moves out of `#/desktop`,
  which the phone may not import, into `#/lib/navigation`.
- `candidate` names the voucher, EIP-55 checksummed; any other form is
  ignored. `voucher` is taken (the pool route redirects it to the voucher page)
  and so is `manage`.
- **Precedence.** `parsePoolSideRequest` already ranks `entry` over `manage`
  over `tool`. `candidate`, `exchangeRate` and `creditLimit` apply only when the
  winning request is `tool=approve`; beside `entry` or `manage` they are
  ignored.
- **Resolution.** The address resolves through the voucher detail the picker
  already reads for decimals (`useMarketVoucherDetail`), which supplies the
  name, symbol and decimals for `setPicked`. While it loads, the sheet shows the
  picker's pending state. An address the catalog does not know opens the empty
  picker with "Couldn't find that voucher" and drops the seeds. A read error
  offers a retry and keeps them.
- **Already approved.** A voucher already in the pool, by catalog row or by
  registry membership, shows today's "This voucher is already approved." block
  and drops the seeds. A link never becomes a rate or limit change on a live
  voucher; that stays a deliberate `manage`.
- **Chain reads still gate.** `exchangeRate` and `creditLimit` replace the
  chain-derived `seed` only once `configuring` is non-null, so every existing
  block (quoter pending, membership unread, rate or cap unread, decimals
  unknown) still holds, and `register` is still the registry's answer.
  `usePoolVoucherConfiguration` takes `defaultValues` once, so the seeded values
  must be in place when it mounts. Both follow the v1 encoding (quoted decimal
  strings) and are validated by `poolVoucherRateSchema`; an invalid one keeps
  the chain value.
- Picking a different voucher in the picker drops the seeds, which were for the
  named one.
- **Close, success and Back.** Close and a successful save both go through
  `usePoolSideNavigation().close`, and `poolSideSearch(null)` clears `tool`,
  `candidate`, `exchangeRate` and `creditLimit` together. A deep link's entry is
  not marked `poolSide`, so `close` replaces it with the pool page, as it does
  today: Back then leaves the pool instead of reopening a seeded sheet for a
  voucher that is now approved. An approve panel opened inside the app carries
  no seeds and keeps today's push and pop.
- The sheet opens only for someone who can configure the pool
  (`canManageOnChain`). Anyone else sees the page unchanged.
- The steward reviews and signs the registry, limiter and quoter batch exactly
  as today. Nothing signs from the link.
- Optional: the voucher receipt offers this link so a creator can ask a
  steward to add the voucher.
- Out of scope: creating a pool together with its vouchers from one link. The
  pool address exists only after the deploy confirms, and each voucher needs
  its own rate and limit. That is a migration job for the admin console or
  phase 4.

## Phase 4, deferred: import by reference

`?import=<id>`, fetched from clc-core through a `@clc/api` `queryOptions`
factory. An integrator posts the payload with an API key, and the image
sources are imported at post time against the same allowlist. This removes the
URL size limit and adds a known source, expiry and batches. Build it only when
an integrator needs more than v1 carries.

## Constraints

- Resource limits (`E11`) cap how many vouchers and pools one account can
  create. A migration batch needs raised allowances first.
- Names and symbols may already be taken on Gnosis. The name check fails on
  Next, and the symbol is swapped at publish.
- The URL always lands on step 1. `beforeLoad` normalizes a later step that
  carries a prefill (see URL lifecycle); the step guard alone does not.

## Phases

1. Voucher and pool text prefill. clc-app only.
2. Image import. storage-server first, then clc-app.
3. Steward approve prefill.
4. Import by reference. Deferred.

## Tests

- **`@clc/core` prefill schemas.**
  - Fractional coordinates, partial location, and numbers and booleans from the
    router's parser.
  - Unknown or missing `v`, one invalid field among valid ones, oversized
    description, terms that are not a URL, duplicate and empty tags, more than
    12 tags, and `oracle` with a unit that has no feed.
  - A quoted `9007199254740993.000001` reaches `supply` digit for digit; a bare
    number, boolean or null in a string field drops it.
  - `acceptedTerms` and `feeAddress` are ignored when present.
- **URL builder.** In `apps/web`, the builder's output through the router's
  `defaultParseSearch` gives back every value exactly: numeric-looking,
  `true`/`null`-looking, quoted and non-ASCII strings come back as strings,
  `v` as `1`, coordinates as numbers, and `feesDecoupled` as a boolean that
  the schema accepts.
- **Non-string fields.** `feesDecoupled=true` and `feesDecoupled=%22true%22`
  both apply; `feesDecoupled=yes` drops the field. `v=%221%22` is accepted.
- **Size budget.**
  - A link at 4,096 bytes made of three-byte characters and delimiter-heavy
    values yields an onboarding redirect under 16,384 bytes and returns the
    identical prefill after sign-in. One byte over ignores the prefill and makes
    the builder throw.
  - Accepted fields of a few bytes plus a 6 KB param the route does not read,
    and again plus a 6 KB rejected field: the prefill is ignored, and the
    onboarding redirect carries the pathname alone and stays under the limit.
  - Any route behind `AuthenticatedRoute` with an oversized query gets a
    pathname-only redirect.
- **Form hooks.**
  - The prefill composes with the profile prefill and does not lose to it on
    `unitOfAccount`.
  - A view-draft restore still wins over the prefill.
  - A retry snapshot is replaced.
  - An untouched prefilled form survives a layout switch on every step, after
    Next has dropped the params.
- **Image import** (real QueryClient).
  - A layout switch while the import is pending sends one request and the
    arriving view applies its result.
  - An upload or removal while pending, then the late completion, keeps the
    person's choice; so does a failure that arrives late.
  - The place step mounting `ImageUploadField` does not clear the import's
    block.
- **Navigation** (`createMemoryHistory`).
  - Back after publish does not reopen the prefilled form.
  - A signed-out user returns to a prefilled step 1 after sign-in.
  - Step navigation drops the params.
  - `/vouchers/create/review?v=1&name=…` and the pool equivalent land on step
    1 with the prefill.
- **`@clc/api` import.** Error mapping, one token re-read on a 401, and a
  stable `uploadId` per source.
- **Approve prefill (phase 3).**
  - A checksummed `candidate` resolves to name, symbol and decimals; a
    lower-case or unknown address opens the empty picker without seeds.
  - An already approved voucher shows the block and drops the seeds.
  - Seeds wait for every chain read and never lift a block.
  - `entry` or `manage` beside `tool=approve` wins, and the seeds are ignored.
  - Close and success clear all four params, and Back after either does not
    reopen the sheet (`createMemoryHistory`), deep-linked and opened in-app.
  - A non-steward sees the page unchanged; the same link opens the phone sheet
    and the desktop panel.
- **storage-server.**
  - Host not on the list, private addresses, redirects, and the size cap.
  - A resolver that answers public, then private, never connects to the
    private address. IPv4-mapped and NAT64 forms are refused, a proxy in the
    environment is ignored, and the certificate is checked against the
    hostname.
  - Content-type detection from leading bytes, centre-crop, and the same object
    on a repeated import.

## Decided

- The endpoint is `POST /v1/import`, configured by `import.allowed_hosts` /
  `STORAGE_IMPORT__ALLOWED_HOSTS`.
- The first migration's allowlist is `sarafu.network` only, on staging and
  prod alike, set in storage-server's checked-in `config.toml`. Hosts match
  exactly, so a subdomain needs its own entry.

## Open questions

- Whether a migration needs email and phone that differ from the profile. If
  it does, add them in v2.
