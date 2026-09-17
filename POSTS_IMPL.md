# Posts authoring and moderation implementation plan

## Outcome

Implement post authoring in the mobile PWA and global post CRUD/moderation in
the desktop console without weakening the existing approved-only Posts feed.
The API continues to call the resource `reports`; product copy calls it
**Posts**.

This is a cross-repository change. Backend management reads must land in
`clc-core` before either frontend can offer a complete edit or moderation flow.
All frontend logic is chain-agnostic and belongs on both Celo and Gnosis; do not
change either Wrangler file.

## What already exists

`clc-core` commit `91efa1e` (`feat(api): add post CRUD and approval workflow`) is
an ancestor of the current backend branch. The routes are real, not just
documented, and `go test ./internal/api ./internal/store` passes (database-backed
cases remain conditional on `CORE_TEST_DSN`).

| Existing route                    | Current authority                      | Current behavior                                               |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `GET /api/v2/reports`             | authenticated user or service          | Lists `APPROVED` only                                          |
| `GET /api/v2/reports/:id`         | authenticated user or service          | Reads `APPROVED` only; any other status is `404`               |
| `POST /api/v2/reports`            | user JWT                               | Normal user creates `SUBMITTED`; superadmin creates `APPROVED` |
| `PUT /api/v2/reports/:id`         | original author or superadmin user JWT | Assign-all update; currently preserves status                  |
| `PUT /api/v2/reports/:id/approve` | superadmin user JWT                    | Idempotently sets `APPROVED`                                   |
| `DELETE /api/v2/reports/:id`      | superadmin user JWT                    | Hard-deletes the row and cascaded relations                    |

The write document already supports title, Markdown body, feed description,
cover image, coordinates, period, host/participant/time fields, up to 12 tags,
up to 12 vouchers, up to 50 images, and up to 20 attachments. `PUT` is
assign-all: omitted optional fields are cleared and omitted collections become
empty arrays.

The app already has an approved-post feed and detail UI, report query factories,
report image upload policy, tag controls, voucher catalogs, and admin tables.
Those are useful foundations, but they do not make management complete.

## Gaps to close first

1. There is no way for an author to list or reopen their own `SUBMITTED` post.
   The public list/detail intentionally hide it.
2. There is no superadmin list/detail read for unapproved posts. An operator can
   approve, edit, or delete an id only if they somehow learn that id elsewhere.
3. A normal author can currently edit an `APPROVED` post and it stays approved.
   That lets unreviewed replacement content bypass moderation.
4. `@clc/api` currently drops `body`, `attachments`, `status`, and voucher
   `id`/`chainId` while normalizing report detail. An assign-all editor built on
   that object would silently erase data.
5. The storage client uploads images only. Core can record `FILE` and `EMBED`
   attachment URLs, but this client cannot upload arbitrary documents or video.
6. The existing admin account and voucher report panels use the approved-only
   catalog query. They cannot be treated as management/audit views until they
   use the new admin reads.

## House style (non-negotiable)

Copy the offerings, voucher, and admin-table features. Do not invent a parallel
stack for posts.

**Boundaries.** Domain types and schemas in `@clc/core`. HTTP clients and
`queryOptions` factories in `@clc/api`. Route files stay thin: export `Route`,
put pages in `features/`. No app imports another app. No vendor SDK in core or
api. No `'use server'`, no Nitro API routes.

**UI kit.** Existing shadcn primitives on `@base-ui/react`. `lucide-react` only
inside those primitives. App icons from `react-icons`. No Radix, no new icon
set, no Tailwind Typography, no `@tailwindcss/typography`. Square corners as
each app already does them: web primitives `rounded-none`; admin tokens already
zeroed. Web is 360–430 px only — no `md:` / `lg:` / `xl:` layout. Admin may
reflow. Page shells are full-bleed, not `<Card>`. Info tiles are
`border border-border bg-card p-4`. Inputs and outline buttons on the gray
page use `bg-card`. Primary CTAs are `h-11` on web.

**State.** Server data stays in TanStack Query. Table filters, pagination, and
the admin status queue live in typed router `search`. Form fields live in
TanStack Form. Write/Preview is component `useState`, not a URL tab. Do not
mirror query or wagmi results into Zustand.

**Forms.** `@clc/core/lib/forms` `useForm` plus a zod 4 Standard Schema. Display
errors with `getFieldError`. On web, put fields through `#/components/ui/field`
so `#/lib/validation-i18n` translates the English schema strings the same way
signup, vouchers, pools, and offerings already do. Do not add a schema factory
or issue-code layer just for posts. Admin keeps the English schema text.

**New libraries.** None except the Markdown renderer below. Editor, dialogs,
tables, uploads, location, and tags already exist. Web Write/Preview uses the
existing `Toggle`; admin Write/Preview uses existing `Tabs`. Do not add
Collapsible; optional editor sections use `<details>` / `<summary>` like
`PaperWalletCustomizer`. Do not add Alert Dialog; destructive confirmations use
the existing `Dialog` pattern from the offering unlist sheet. A missing shadcn
primitive is added with the shadcn MCP onto `@base-ui/react`, never as a
one-off.

### Status and authority

| Action                                                  | Result                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| Normal user creates                                     | `SUBMITTED`                                                   |
| Superadmin creates                                      | `APPROVED`                                                    |
| Normal author edits `DRAFT`, `SUBMITTED`, or `REJECTED` | `SUBMITTED`                                                   |
| Normal author edits `APPROVED`                          | `SUBMITTED` again; it leaves the public feed until reapproved |
| Superadmin edits                                        | Preserve the current status                                   |
| Superadmin approves                                     | `APPROVED` without rewriting content                          |
| Superadmin deletes                                      | Hard delete after explicit confirmation                       |

`DRAFT` and `REJECTED` remain visible in management reads for legacy rows, but
this release does not create drafts or add a reject operation. Normal authors do
not get delete authority: the current backend deliberately reserves deletion for
operators so the catalog remains auditable. Thus the mobile permission set is
create/read-own/update-own; the console has global create/read/update/delete plus
approve.

Approval is not reversible in the current contract. Both quick approval and the
detail-screen approval action must say that clearly and require confirmation.

### Separate management reads

Do not widen `GET /api/v2/reports` or `GET /api/v2/reports/:id`. Their
approved-only representation is already cached and consumed as the user-facing
catalog. Returning different rows based on the caller would create privacy and
cache-identity hazards.

Add explicit author and admin reads instead:

| New route                          | Authority  | Visibility                                                           |
| ---------------------------------- | ---------- | -------------------------------------------------------------------- |
| `GET /api/v2/users/me/reports`     | user JWT   | All statuses authored by the caller                                  |
| `GET /api/v2/users/me/reports/:id` | user JWT   | Complete own post in any status; `404` for missing or another author |
| `GET /api/v2/admin/reports`        | superadmin | All posts and statuses                                               |
| `GET /api/v2/admin/reports/:id`    | superadmin | Complete post in any status                                          |

List endpoints use an activity cursor because an old approved post can become a
new moderation task when its author edits it. Order by
`updated_at DESC, id DESC`; ordering by id alone would bury that resubmission at
its original creation position. Accept `perPage`, optional paired
`cursorUpdatedAt` / `cursorId`, and `next`. Return `reports` plus `first` and
`last` cursor objects (`{ updatedAt, id }`) so both forward and backward keyset
pagination are duplicate-free even when timestamps tie. Omitting both cursor
fields names the first page; supplying only one is a validation error. Accept
these filters:

- `q`: normalized 2–64 character title/description search.
- `status`: one of `DRAFT`, `SUBMITTED`, `APPROVED`, or `REJECTED`.
- `author`: exact, case-insensitive wallet address (admin only; implicit current
  author on `/users/me`).
- `tags`/`tagMatch` and `vouchers`/`voucherMatch`: the existing catalog
  relationship syntax, so the global console and its account/voucher panels can
  use one management endpoint.

Every management summary must include `status`; detail must include the complete
editable document. Keep `body` out of list rows. Empty lists are `[]`, not
`null`. Management reads use `Cache-Control: no-store`.

### Markdown, not a rich-text framework

The editor is the existing shadcn/Base UI `Textarea`. Core already stores
Markdown text, the mobile keyboard stays native, and there is no HTML/JSON
conversion layer. Do not add Tiptap, Lexical, MDXEditor, Milkdown, CodeMirror,
Bytemd, EasyMDE, Toast UI, `@uiw/react-md-editor`, or any packaged Markdown
editor (~90–450 KB of toolbar CSS and a second visual language).

The only new runtime dependency is **`@tanstack/markdown`**. Use its narrow
`/react` and `/parser` entry points only for preview and display.

| Candidate                             |        Gzip (measured) | Why not                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `Textarea` (editor)          |                      0 | Chosen                                                                                                                                                                                                                                                                |
| `@tanstack/markdown/react`            |                 6.7 KB | Chosen. React 18+ peer (we are on 19), zero runtime deps, React elements, raw HTML off unless `allowHtml`, GFM tables/lists/strike built in, unsafe `javascript:` URLs stripped. Maps onto each app's tokens via the React adapter. Same vendor as Query/Router/Form. |
| `markdown-to-jsx`                     |                  ~5 KB | Smaller, but raw HTML is on by default — wrong for author-supplied posts.                                                                                                                                                                                             |
| `react-markdown` + `remark-gfm`       |   ~37 KB unified stack | Safe and capable, but five times the renderer we need, plus a plugin pipeline we would have to keep closed.                                                                                                                                                           |
| `marked` + DOMPurify                  |     ~12 KB + sanitizer | Emits HTML strings; would require `dangerouslySetInnerHTML`.                                                                                                                                                                                                          |
| `@tanstack/highlight` / Prism / Shiki | tens to hundreds of KB | Code in posts is `font-mono` `<pre>`/`<code>`. No highlighter.                                                                                                                                                                                                        |

Constraints on the chosen renderer:

- Import only `@tanstack/markdown/react` for rendering and
  `@tanstack/markdown/parser` when pre-parsing a deferred preview. Do not import
  the HTML renderer, docs preset, callouts, streaming profile, or
  `@tanstack/highlight`.
- Never pass `allowHtml: true`. Never use `dangerouslySetInnerHTML`.
- Map headings, paragraphs, lists, tables, links, blockquotes, and code to each
  app's existing type scale. Do not add Tailwind Typography.
- Put wide tables in a horizontal scroll container. Wrap long URLs and code.
  Override the image mapping to render nothing — images live in `report_images`,
  not in the Markdown body.
- Keep the default URL transform and layer an app-owned anchor mapping over it:
  allow relative URLs plus `https:`, `http:`, and `mailto:` only; omit `href`
  for anything else. External links get `rel="noopener noreferrer"` and a
  visible focus ring. This restriction is required because the upstream package
  explicitly does not claim to be a complete sanitizer for user-generated
  content.
- Load the component only from post detail/editor route chunks. On mobile, parse
  only while Preview is active. On desktop, parse a deferred value, not every
  keystroke. `parseMarkdown` returns a serializable AST; reuse that for preview.
- The package is pre-1.0. Pin the same exact version (no `^` or `~`) in
  `apps/web/package.json` and `apps/admin/package.json`; upgrade only after the
  fixtures below pass. UI mapping stays app-private. Do not put the renderer in
  `@clc/core` or `@clc/api`.

TanStack Markdown is a documented subset, not full CommonMark. It covers the
imported corpus we actually need (ATX headings, emphasis, lists, GFM tables,
explicit links, fenced code). It does **not** autolink bare URLs — those stay
text, which is acceptable. Phase 3 fixtures must include a GFM table, an
explicit link, a raw `<script>`, and a long wallet/hash string. If an imported
body loses a table or a `[text](url)` link, stop and reassess; do not silently
widen the parser.

Sources: [TanStack Markdown](https://tanstack.com/markdown/latest), the
[size comparison](https://tanstack.com/markdown/latest/docs/comparison), and
the [user-content security caveat](https://tanstack.com/markdown/latest/docs/project/faq#can-i-use-it-for-user-generated-content).

### Media scope

Images are in scope. Build a post-specific image manager on the existing
`report.image` policy and `uploadInOrder` — no new storage client. Storage
returns output `width` / `height` / `byteSize`; persist those as `maxWidth` /
`maxHeight` / `byteSize` and leave the editor display box (`width`/`height`)
null, which is how this app's other uploads already behave. Support captions,
reorder, removal, and “Use as cover” (copies that URL onto `imageUrl` without
removing it from `images`). Disable Save while any upload is pending. Never
place image bytes or data URIs in the Markdown body.

For this release, attachments are URL records:

- allow a new `EMBED` URL;
- allow an existing `FILE` row to be retained, edited, reordered, or removed;
- allow a `FILE` URL only when the file already has a durable `http(s)` URL;
- do not present a local file picker until storage-server has a separately
  designed arbitrary-file upload endpoint and policy.

Most importantly, editing a legacy post must hydrate and resubmit every existing
attachment even when the operator does not touch that section.

## Phase 1 — backend management contract (`clc-core`)

### Store and SQL

1. Add a management list filter/cursor type rather than weakening
   `CatalogFilter`'s approved-only meaning.
2. Add store queries for:
   - all-status rows owned by one address;
   - all-status admin rows;
   - full detail constrained by `(id, author_address)`;
   - full all-status detail for a superadmin.
3. Keep list projections and detail projections centralized so adding a field to
   one management route cannot make the other lossy.
4. Add an index migration for the actual new predicates/order, at minimum
   `(status, updated_at DESC, id DESC)` and
   `(lower(author_address), updated_at DESC, id DESC)`. Add non-partial
   title/description trigram indexes if `EXPLAIN (ANALYZE, BUFFERS)` shows the
   all-status search cannot use the existing approved-only indexes.
5. Retain database transaction boundaries and the same statement timeout used by
   other catalog/admin reads.

### Handlers and policy

1. Mount author reads on `userGroup`; mount global reads on `adminGroup`.
2. Reuse the existing query validators for search, tag, voucher, and wallet
   syntax, but validate report status against the four-value report vocabulary.
3. Return `404`, not `403`, when `/users/me/reports/:id` names another author's
   row.
4. Change `reportUpdateHandler`/the update statement so a non-superadmin update
   writes `SUBMITTED`; a superadmin update preserves status. Continue deriving
   caller and role from the verified user JWT.
5. Make collection uniqueness one explicit wire invariant instead of letting the
   Go and TypeScript validators drift. After trimming/normalizing, reject
   duplicate tags, voucher `(chainId, lowercase address)` identities, image
   URLs, and attachment `(kind, URL)` identities with `400`; do not silently
   deduplicate some collections while accepting duplicates in others.
6. Keep approval a status-only statement and deletion superadmin-only.
7. Document that user edits of approved content require reapproval and that
   admin-created posts are immediately approved.

### Backend tests

- Unit-test status/filter/cursor parsing, including invalid and mixed-case input.
- Database-test exhaustive, duplicate-free forward/back paging under each status
  and owner filter.
- Prove author list/detail includes that author's unapproved rows and no other
  author's rows.
- Prove admin list/detail includes all four statuses.
- Prove the existing public feed/detail still expose approved rows only.
- Rewrite, do not merely extend, the mutation lifecycle tests that today assert
  an author edit of an `APPROVED` post stays `APPROVED`
  (`report_mutation_test.go`, `report_write_db_test.go`). After the SQL change:
  approve an author's post, edit it as the author, verify it becomes
  `SUBMITTED` and disappears publicly, approve it again, then edit as admin and
  verify it stays `APPROVED`. Update `docs/API.md` §11.5 to match. The update
  statement must accept a status write for non-superadmin; `UpdateReport` today
  does not take `status`.
- Prove management relation filters and unknown tag/voucher failures match the
  existing catalog contract.
- Prove duplicate tags, vouchers, images, and attachments all fail consistently
  after normalization.
- Run the route/database suite with `CORE_TEST_DSN`, not only the skip-capable
  unit invocation.

## Phase 2 — shared domain and HTTP layer (`clc-app`)

### `@clc/core`

Add `packages/core/src/features/reports/logic.ts` containing only portable
domain code:

- `REPORT_STATUSES` and `ReportStatus`;
- the complete form/write types;
- validation constraints matching Core exactly, including the normalized
  collection-uniqueness contract added in Phase 1;
- cross-field validation for coordinate pairs and period ordering;
- uniqueness and cardinality checks for tags, vouchers, image URLs, and
  attachments;
- pure `emptyReportWrite`, `reportToFormValues`, and `formValuesToReportWrite`
  helpers.

Keep dates as explicit ISO strings at the API boundary and convert
`datetime-local` values in pure helpers. Do not put React, hooks, routing, upload
clients, or localized UI in core. Schema error `message` strings are English, as
in `packages/core/src/features/offerings/logic.ts`. Web translates them through
the existing `translateValidationError` switch in `#/lib/validation-i18n` (and
`Field`); admin shows them as-is. Add a case for every new message and cover it
in `-validation-i18n.test.ts`.

### `@clc/api`

Extend `packages/api/src/features/reports/client.ts` rather than adding app-local
fetch calls:

- retain `ReportVoucher.id` and `ReportVoucher.chainId`;
- add `ReportAttachment`, `body`, and the managed status types;
- add `ManagedReportCursor` plus managed page `first`/`last` cursor objects for
  the `(updatedAt, id)` ordering; do not reuse the public feed page shape or the
  numeric admin page type;
- keep public `ReportSummary` distinct from `ManagedReportSummary`, whose status
  is required;
- normalize full details without dropping any assign-all field;
- add `createReport`, `updateReport`, `approveReport`, and `deleteReport`;
- add `getMyReports`, `getMyReport`, `getAdminReports`, and `getAdminReport`;
- send every editable key and all four collections on `PUT`, including empty
  values intentionally chosen by the form;
- serialize a write once, measure the UTF-8 bytes of that complete JSON body,
  and throw a typed `ReportPayloadTooLargeError` before fetch when it exceeds
  Core's `1 << 20` body limit. Test multibyte text and relation-heavy payloads;
  a character count is not a byte count and the limit covers the whole request,
  not only `body`. Both apps map that typed error to their localized/English
  form message without discarding the form;
- use `cache: "no-store"` on all management reads and writes.

Keep these calls on the reports resource client even for `/admin/reports` so
normalization is implemented once. `createClcApi()` already exposes that client
to admin; `apps/web` may continue using its configured reports client.

Extend `packages/api/src/features/reports/queries.ts` with keys/factories,
following `offeringKeys` (separate public vs managed shapes, filters in the
key, address lowercased):

- `mine(address, params)` and `myDetail(address, id)`;
- `adminList(params)` and `adminDetail(id)`;
- public `feed` / `filtered` / `detail(id)` unchanged.

Include the authenticated address in “mine” keys so a session switch cannot
reuse another author's rows. Do not reuse `reportKeys.detail(id)` or the unused
`reportKeys.list` for management reads — those are the approved catalog.

Mutations follow the offering write path: no optimistic approval or
authorization; the mutation response is authoritative. Split query keys into
public-list, public-detail, mine-list/detail, and admin-list/detail families so
invalidation does not also refetch the app-private reverse-geocode keys. Patch
exact detail records, but invalidate filtered/cursor list families whenever
content, relations, ordering, or status can change membership. Specifically, on
success:

- seed `myDetail` / `adminDetail` with the mutation payload, never public
  `reportKeys.detail(id)` unless the post is `APPROVED`;
- after a `SUBMITTED` create, invalidate mine/admin list families only. After an
  admin-created `APPROVED` post, also invalidate every public list family;
- after any update, invalidate mine/admin list families because title, tags,
  vouchers, status, and `updatedAt` can all change filter membership or order;
- when either the pre-mutation or resulting status is `APPROVED`, also
  invalidate public list families and the public detail. This covers an admin
  content edit that stays approved as well as an author edit that leaves the
  public feed. If the previous status is unavailable, invalidate public queries
  conservatively rather than risk stale published content;
- after approval, invalidate mine/admin and public list families and seed the
  public and managed details from the approved response;
- after delete, remove every public/mine/admin detail key for that id and
  invalidate managed lists; also invalidate public lists if the deleted row was
  approved or its prior status is unknown. Do not hand-patch arbitrary filtered
  cursor pages whose membership cannot be proven locally;
- never use `invalidateQueries({ queryKey: reportKeys.all })`: that prefix also
  holds public feed variants and reverse-geocode keys that do not all need the
  same treatment;
- keep `isPending` on the triggering control; a failed mutation leaves the form
  and dialog in place, including already-uploaded URLs.

Client tests must assert complete assign-all serialization, UTF-8 payload-size
enforcement, defensive response normalization, status parsing, management query
serialization, cache-key separation, and every branch of the mutation
invalidation matrix—including admin edits that remain approved.

## Phase 3 — safe Markdown display

1. Add an app-private `MarkdownContent` wrapping `@tanstack/markdown/react` in
   each app. Mapping differs because mobile and admin type scales differ.
2. Do not pass `allowHtml`. Do not add remark/rehype plugins, highlight, or a
   typography plugin.
3. Put wide tables in a horizontal scroll container, wrap long URLs/code, and
   keep images out of Markdown rendering.
4. Render external links with clear focus styles and `rel="noopener noreferrer"`;
   preserve the renderer's URL transform and additionally allowlist relative,
   HTTP(S), and mailto links in the mapped anchor.
5. Extend `ReportPage` to show `body` after the description and render attachment
   links with kind, filename/host, and byte size. Description stays a plain
   `<p>` — it is feed copy, not Markdown.
6. Test headings, emphasis, lists, a GFM table, an explicit `[text](url)` link, a
   fenced code block, raw `<script>`, executable/data/vbscript and obfuscated
   protocol links, and a long unbroken wallet/hash string at 360 px width.

## Phase 4 — mobile author workflow (`apps/web`)

### Routes and navigation

Add authenticated routes inside the existing `_nav` shell. Convert the current
leaf `$reportId.tsx` into a directory so edit does not turn the detail file into
a layout without an `<Outlet />`:

- `_nav/posts/new.tsx` → `/posts/new` (create);
- `_nav/posts/mine.tsx` → `/posts/mine` (session author's posts);
- `_nav/posts/$reportId/index.tsx` → `/posts/$reportId` (approved public detail,
  moved from `$reportId.tsx`);
- `_nav/posts/$reportId/edit.tsx` → `/posts/$reportId/edit` (owner detail
  endpoint).

Route files stay thin: `createFileRoute`, `staticData: { navOwner: "posts" }`,
`AuthenticatedRoute`, and a feature page. Static `new` and `mine` win over
`$reportId`. Keep `/posts/` as the existing redirect to `/?tab=posts`. Back
controls use `BackChevron` (`useCanGoBack()` / `history.back()` with a
`/?tab=posts` or `/posts/mine` fallback). Memory-history tests, prefixed with
`-` if colocated under `src/routes/`, cover direct loads and create/edit
completion. Selecting an already-active `Link` is a no-op.

Add two compact actions to the existing Posts header: **New post** (primary) and
**My posts**. Selecting the already active destination is a no-op.

### Mobile UI

Build an app-private `PostEditorPage` with the canonical top-to-bottom mobile
scaffold—no page Card, centered box, max-width shell, rounded surface, shadow, or
desktop breakpoint. Use:

- the locked 1.75rem page title;
- white, square existing inputs/textarea on the gray background;
- `h-11` primary Save/Submit actions;
- plain spacing for the main form and flat `border border-border bg-card p-4`
  only for optional detail groups;
- use the existing web `Toggle` as one pressed/unpressed **Preview** control
  above the Markdown textarea. Unpressed shows Write; pressed shows Preview.
  This is not a two-item segmented control and never becomes a side-by-side
  phone layout. Do not add Tabs or ToggleGroup, and do not put this component
  state in search params;
- show character counters near the body/description limits, but enforce the
  separate UTF-8 size check from Phase 2 against the complete serialized write;
- optional sections as `<details>` / `<summary>` for event details, place,
  relationships, images, and attachment URLs so title-only creation stays
  quick.

Use TanStack Form with the shared report schema, `getFieldError`, and `Field`.
Reuse the existing location picker, tag combobox, voucher catalog queries, and
`report.image` / `uploadInOrder` transport. `ImageUploadField` is one URL; the
post image manager is new UI on top of that transport, not a new upload
library. Map storage `width`/`height`/`byteSize` onto `maxWidth`/`maxHeight`/
`byteSize` and leave the display box null. Do not mirror query or wagmi data
into Zustand.

After creation, show “Submitted for approval” and navigate to `/posts/mine`,
where status chips distinguish Awaiting approval, Approved, legacy Draft, and
Rejected. A pending row links to its owner edit route, not the approved-only
detail route. An approved row may offer both View and Edit. There is no mobile
Delete action under the current authority model.

When an approved author opens Edit, show a warning before submit that saving will
temporarily remove the post from the public feed until it is approved again.
Warn before abandoning a dirty form. Keep values and already uploaded URLs after
a failed save.

Every new or changed mobile string—including validation, upload errors, status
copy, confirmations, and toasts—uses Lingui. Run `pnpm i18n:extract`, commit all
three catalogs, and fill every new Serbian and Swahili `msgstr` before
considering the slice done.

## Phase 5 — global admin CRUD and moderation (`apps/admin`)

### Routes and shell

Add, matching the existing `_shell/users` / `_shell/vouchers` layout:

- `_shell/posts/index.tsx` → `/posts` table;
- `_shell/posts/new.tsx` → create an immediately approved post;
- `_shell/posts/$reportId/index.tsx` → all-status review/detail;
- `_shell/posts/$reportId/edit.tsx` → full assign-all editor.

Do not place a page component at `$reportId.tsx` beside a `$reportId/` folder —
that file becomes a layout and detail will not render without an `<Outlet />`.
Route files stay thin; pages live in `features/`.

Add Posts to `NavPath`, sidebar navigation, `AppBreadcrumb`, and the command
palette using a `react-icons` app icon (`hi` set, like the rest of the shell).
Admin remains English-only—no Lingui imports.

Create a post-specific typed search parser (hand written, beside
`table-search.ts` / `voucher-detail-search.ts`) with `status`, author, tags,
vouchers, paired `cursorUpdatedAt` / `cursorId`, and `dir`. It may reuse page
size/sort helpers, but it cannot extend the numeric `TableSearch` cursor or use
`usePagedTable` unchanged. Add a small post-specific paging adapter over the
same `DataTable` callbacks and the management endpoint's compound `first`/`last`
cursors. Default `/posts` to `SUBMITTED`; `ALL` is an explicit URL-only status
sentinel because an omitted value means the default queue. The API client omits
`status` when the sentinel is `ALL` and never sends `ALL` to Core. Preserve
filters/page/sort through Back/Forward and drop both cursor fields on any filter
change. URL `dir` stays `next` | `prev`; the API boolean `next` is mapped in the
client, not stored in the URL. Normalize `q` to 2–64 trimmed characters before
navigating or calling Core; keep a one-character draft local to the search
control rather than producing a guaranteed `400`. Sorting remains client-side
over one fetched page and must be labelled as such until the backend accepts
sort parameters.

### Moderation table

Use `#/components/admin/data-table` with these columns:

- title and description summary;
- `StateBadge` status;
- author address using `formatVoucherAddress`;
- up to three tags/linked-voucher summary;
- created/updated figures using `font-data`;
- row actions: Review/Edit, Approve when not approved, Delete.

`StateBadge` already names `APPROVED` and `REJECTED`. Add `SUBMITTED` (label
“awaiting approval”, pending tone) and `DRAFT` only. Put `q`, status (Awaiting
approval/Approved/Draft/Rejected/All), author, tag, and voucher controls in the
toolbar. The empty state must name the active filter, especially the default
approval queue.

An Approve action is available from both a row and the review page, but it opens
an explicit confirmation because the API has no unapprove transition. Disable
duplicate actions while the mutation is pending. On success, patch/remove the
row according to the active status filter, seed detail, invalidate public Posts,
and toast the result. A failed mutation leaves the row and dialog in place.

### Admin detail/editor

The review page shows the rendered article and media as the primary column and a
square, flat metadata/status panel as the secondary column. It must expose all
fields Core will replace, including otherwise easy-to-miss attachments and
image metadata. Actions are Approve, Edit, and Delete.

Use a full page for the editor rather than squeezing long content into a Sheet.
Use the existing admin `Tabs` for mutually exclusive Write and Preview panels at
every admin breakpoint; Tabs do not represent a side-by-side layout. Parse the
deferred body only while Preview is selected. Reuse the same shared write mapping
as mobile but compose admin-private controls and English copy. Admin has no
`LocationPicker` — duplicate the geo control in admin UI
(MapLibre is already there) rather than importing `#/` from web. Only `geoLat`/
`geoLng` persist; `reports.location_name` was dropped in migration 010.
Superadmin creation uses the same `POST /reports` and explains that the result
publishes immediately.

Delete uses the existing `Dialog` confirmation (offering unlist), names the
post, describes the hard delete, and navigates back to the filtered table only
after success.

Update the account Reports tab to use `getAdminReports({author})`, include
status, and link each row to admin post detail. The account stats tile still
counts approved reports only (`account-relationship-counts`). Either keep that
tile labelled “Approved posts” or surface the delta; do not let an all-status
tab sit next to an approved-only total. Update the voucher Reports tab to use
the admin voucher filter if it is intended as an audit view; otherwise label it
explicitly “Approved posts” and keep the catalog query.

## Phase 6 — tests, accessibility, and verification

### Frontend automated coverage

- Core schema boundary tests for every max count/length, URL scheme, duplicate,
  coordinate pair, period ordering, and form/detail round trip.
- API client tests proving no field or relation is dropped and no partial `PUT`
  is possible.
- Query-cache tests for create, author re-submit, approve, admin update, and
  delete across public, mine, admin, author, and voucher views. A SUBMITTED
  create must not seed or refetch public `detail(id)` / the approved feed.
- Mobile route/history tests for New, My posts, public detail, and owner Edit.
- Mobile form tests for title-only submit, full document submit, upload busy
  state, failed retry retention, dirty-form warning, and approved-edit warning.
- Admin search/navigation tests proving status is URL state, filter changes reset
  cursors, and Back restores the exact table view.
- Admin moderation tests for default submitted queue, all-status detail, approve
  confirmation/idempotence, global edit, create, and hard-delete confirmation.
- Markdown tests for semantic output, keyboard focus, hostile raw HTML, safe
  links, table overflow, deferred preview, and that `@tanstack/highlight` is
  not in the chunk.

### Manual viewport and interaction pass

Use browser automation after automated tests:

- web at 360, 390, and 430 px widths with the software keyboard-sized viewport;
- admin at a compact laptop width and a wide desktop width;
- keyboard-only editor tabs, table actions, dialogs, reorder controls, and links;
- screen-reader names for status, image removal/reorder, preview, Approve, and
  Delete;
- light/dark themes in both apps;
- slow upload and failed API states;
- Celo and Gnosis builds using their existing centralized chain configuration.

No post code may read `VITE_CHAIN_ID` directly, and this feature needs no new
environment variables or Wrangler changes.

### Required commands

Backend:

```sh
go test ./internal/api ./internal/store
CORE_TEST_DSN=... go test ./internal/api ./internal/store
```

Frontend, after all copy and code changes:

```sh
pnpm i18n:extract
vp check
vp test
```

Do not auto-run `vp build`. If bundle verification is requested separately,
confirm that `@tanstack/markdown/react` is route-split into the post detail/
editor chunks and that the editor remains the existing textarea. A heavier
editor or highlighter to improve developer convenience is a regression.

## Delivery order and acceptance gates

1. **Backend reads and status transition.** Gate: an author can retrieve only all
   of their own statuses; a superadmin can retrieve all; public visibility is
   unchanged; author edits require reapproval.
2. **Shared schema/client/query contract.** Gate: a complete report round-trips
   without dropping any scalar or relation, and all cache identities are tested.
3. **Markdown display.** Gate: the existing imported bodies render safely on
   phone and desktop, including GFM tables and explicit links, via
   `@tanstack/markdown/react` with `allowHtml` unset.
4. **Mobile authoring.** Gate: a signed-in user can create, find, and edit their
   submitted post and understands the approval state.
5. **Admin CRUD/moderation.** Gate: the default queue finds every submitted post;
   a superadmin can review, approve, globally edit, create, and delete.
6. **Cross-surface regression and i18n.** Gate: tests, catalogs, viewport checks,
   and both chain configurations pass without deployment config changes.

The feature is not complete if only the existing mutation endpoints are wired:
the owner and admin all-status read paths, assign-all round-trip safety, and
reapproval after author edits are correctness requirements, not follow-up polish.
