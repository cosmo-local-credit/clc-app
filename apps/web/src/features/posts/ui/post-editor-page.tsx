import {
  ReportPayloadTooLargeError,
  type ManagedReportDetail,
} from "@clc/api/features/reports/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import {
  REPORT_BODY_MAX,
  REPORT_HOST_NAME_MAX,
  REPORT_MAX_ATTACHMENTS,
  REPORT_MAX_IMAGES,
  REPORT_MAX_TAGS,
  REPORT_MAX_VOUCHERS,
  REPORT_PARTICIPANTS_MAX,
  REPORT_TITLE_MAX,
  emptyReportWrite,
  fromDateTimeLocalValue,
  nowReportPeriod,
  reportToFormValues,
  reportWriteSchema,
  toDateTimeLocalValue,
  voucherRefKey,
  type ReportVoucherRef,
  type ReportWrite,
} from "@clc/core/features/reports/logic";
import { getFieldError, useForm, useStore } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { Skeleton } from "#/components/ui/skeleton";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { BackChevron } from "#/components/wallet";
import { useTokenTags } from "#/hooks/use-deployment";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  clearPostDraft,
  readPostDraft,
  writePostDraft,
} from "#/features/posts/api/post-draft-storage";
import { useMyPost } from "#/features/posts/hooks/use-my-posts";
import { useCreatePost, useUpdatePost } from "#/features/posts/hooks/use-post-mutations";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { PostAttachmentFields } from "./post-attachment-fields";
import { PostConfirmDialog } from "./post-confirm-dialog";
import { PostImageManager } from "./post-image-manager";
import { PostVoucherPicker } from "./post-voucher-picker";

/** Quiet time before an in-progress post is parked in local storage. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

/** A voucher a screen carried in, so the post opens already linked to it. */
type SeedVoucher = { chainId: number; address: string; name?: string };

export type PostEditorTarget =
  | { mode: "create"; voucher?: SeedVoucher | null }
  | { mode: "edit"; reportId: string };

/**
 * Writing or editing one post.
 *
 * A full-bleed screen that flows top to bottom — no card wrapper, no centering,
 * no max-width shell. Title is the only required field, and everything else is
 * behind a `<details>` group so a quick post stays quick.
 */
export function PostEditorPage(target: PostEditorTarget) {
  if (target.mode === "create") {
    return <PostEditorCreate voucher={target.voucher ?? null} />;
  }
  return <PostEditorLoader reportId={target.reportId} />;
}

/**
 * What a new post starts with.
 *
 * Nothing here is asked for twice. The host and the place are the name and
 * location the author gave at signup, the period is the moment of writing, and
 * a voucher a screen carried in arrives linked — all of it editable, and none
 * of it a field to fill before writing.
 *
 * A draft this device parked wins over all of it: it is what the author
 * actually typed. The profile read is awaited rather than merged in later
 * because TanStack Form reads `defaultValues` once, so a form mounted before
 * the profile arrived would keep an empty Place.
 */
function PostEditorCreate({ voucher }: { voucher: SeedVoucher | null }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const profileQuery = useAuthProfile();
  const owner = auth.address?.toLowerCase() ?? "";
  // Read once, on mount: the editor writes to this same slot as it is typed in,
  // so a later read would hand back the values the form already holds.
  const [draft, setDraft] = useState(() => readPostDraft(owner));
  // Stable across renders: the form's save effect keys off this, and a fresh
  // object every keystroke would park the post on every render instead of on
  // the debounce.
  const draftControls = useMemo(
    () => ({
      owner,
      restored: draft !== null,
      onStartOver: () => {
        clearPostDraft();
        setDraft(null);
      },
    }),
    [draft, owner],
  );

  if (profileQuery.isPending) {
    return (
      <EditorShell>
        <div aria-busy="true" aria-label={t`Loading your post…`} className="space-y-4">
          <Skeleton className="h-8 w-4/5 rounded-none" />
          <Skeleton className="h-24 w-full rounded-none" />
          <Skeleton className="h-40 w-full rounded-none" />
        </div>
      </EditorShell>
    );
  }

  const seededRef: ReportVoucherRef | null = voucher
    ? { chainId: voucher.chainId, address: voucher.address }
    : null;
  const profile = profileQuery.data;
  // Both halves of a coordinate or neither: a profile with one is not a place.
  const hasProfileLocation =
    typeof profile?.geoLat === "number" && typeof profile?.geoLng === "number";
  const fresh: ReportWrite = {
    ...emptyReportWrite,
    ...nowReportPeriod(),
    hostName: profile?.name ?? "",
    geoLat: hasProfileLocation ? (profile?.geoLat ?? null) : null,
    geoLng: hasProfileLocation ? (profile?.geoLng ?? null) : null,
    vouchers: seededRef ? [seededRef] : [],
  };
  // The voucher was pressed just now, so it is linked even when a draft is
  // restored over everything else.
  const initial: ReportWrite = draft
    ? {
        ...draft,
        vouchers:
          seededRef &&
          !draft.vouchers.some((entry) => voucherRefKey(entry) === voucherRefKey(seededRef))
            ? [...draft.vouchers, seededRef].slice(0, REPORT_MAX_VOUCHERS)
            : draft.vouchers,
      }
    : fresh;

  return (
    <PostEditorForm
      // Remounted rather than reset when the draft is dropped: `defaultValues`
      // is read once, so a new starting document is a new form.
      key={draft ? "draft" : "fresh"}
      initial={initial}
      linkedNames={
        seededRef && voucher?.name
          ? new Map([[voucherRefKey(seededRef), voucher.name]])
          : new Map<string, string>()
      }
      // Started from a voucher, so Back names the voucher — and a deep load
      // with no history lands back on the tab the button was pressed from.
      back={
        seededRef
          ? {
              label: voucher?.name ?? t`Voucher`,
              to: `/vouchers/${seededRef.address}`,
              search: { tab: "posts" },
            }
          : undefined
      }
      draft={draftControls}
      previousStatus={null}
    />
  );
}

function PostEditorLoader({ reportId }: { reportId: string }) {
  const { t } = useLingui();
  const postQuery = useMyPost(reportId);

  if (postQuery.isPending) {
    return (
      <EditorShell>
        <div aria-busy="true" aria-label={t`Loading your post…`} className="space-y-4">
          <Skeleton className="h-8 w-4/5 rounded-none" />
          <Skeleton className="h-24 w-full rounded-none" />
          <Skeleton className="h-40 w-full rounded-none" />
        </div>
      </EditorShell>
    );
  }

  if (postQuery.isError || !postQuery.data) {
    return (
      <EditorShell>
        <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Couldn't load this post. You can only edit posts you wrote.</Trans>
        </p>
        <Button variant="outline" size="lg" onClick={() => postQuery.refetch()}>
          <Trans>Retry</Trans>
        </Button>
      </EditorShell>
    );
  }

  const post = postQuery.data;
  return (
    // Keyed on the record: TanStack Form reads defaultValues once, so a reused
    // instance would keep showing the previously loaded post.
    <PostEditorForm
      key={post.id}
      post={post}
      initial={reportToFormValues(post)}
      linkedNames={
        new Map(
          post.vouchers.map((voucher) => [
            voucherRefKey({ chainId: voucher.chainId, address: voucher.address }),
            voucher.name,
          ]),
        )
      }
      previousStatus={post.status}
    />
  );
}

function PostEditorForm({
  post,
  initial,
  linkedNames,
  back,
  draft,
  previousStatus,
}: {
  post?: ManagedReportDetail;
  initial: ReportWrite;
  /** Names for chips the picker's search may not return, keyed by `voucherRefKey`. */
  linkedNames: Map<string, string>;
  back?: EditorBack;
  /**
   * Local draft persistence, on the create screen only. An edit has a server
   * copy of the same post, and whichever copy won would depend on which screen
   * was opened last.
   */
  draft?: { owner: string; restored: boolean; onStartOver: () => void };
  previousStatus: ManagedReportDetail["status"] | null;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const auth = useAuthStatus();
  const tagsQuery = useTokenTags();
  const create = useCreatePost();
  const update = useUpdatePost(previousStatus);

  /** Bytes in flight. Save would otherwise persist the list from before them. */
  const [imagesBusy, setImagesBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const saving = create.isPending || update.isPending;
  // A post may only link vouchers its author owns, unless the author is a
  // superadmin. A session with no role is treated as unprivileged: the picker
  // then offers less than the backend might allow, never more than it accepts.
  const voucherOwner =
    auth.session?.role === "SUPERADMIN" ? undefined : (auth.session?.address ?? auth.address);

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: reportWriteSchema },
    onSubmit: async ({ value }) => {
      try {
        if (post) {
          const saved = await update.mutateAsync({ id: post.id, input: value });
          toast.success(
            saved.status === "APPROVED"
              ? t`Post updated.`
              : t`Saved. Your post is awaiting approval again.`,
          );
        } else {
          await create.mutateAsync(value);
          clearPostDraft();
          toast.success(t`Post published.`);
        }
        await navigate({ to: "/posts/mine" });
      } catch (error) {
        // The form keeps its values, including uploaded URLs, so a retry does
        // not re-send the bytes.
        if (error instanceof ReportPayloadTooLargeError) {
          toast.error(t`This post is too large to save. Shorten the text or remove some media.`);
          return;
        }
        toast.error(error instanceof Error ? error.message : t`Couldn't save your post.`);
      }
    },
  });

  // Read through the store: `form.state` is a snapshot taken at render time and
  // does not re-render when the form changes, so the back guard and the unload
  // prompt would both stay armed against the values the page mounted with.
  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isDirty = formIsDirty && !saving;
  const values = useStore(form.store, (state) => state.values);
  // Debounced, because this runs on every keystroke and a draft is only ever
  // read on a later visit; `isDirty` is false while saving, which is what stops
  // a write landing after the submit that cleared the draft.
  const { settled: settledValues, isPending: settling } = useDebouncedValue(
    values,
    DRAFT_SAVE_DEBOUNCE_MS,
  );

  useEffect(() => {
    // `settling` matters as much as the debounce: the settled values lag the
    // form, so the render that first turns the form dirty still holds the
    // values it mounted with, and writing those would park an empty post.
    if (!draft || !isDirty || settling) return;
    writePostDraft(draft.owner, settledValues);
  }, [draft, isDirty, settledValues, settling]);

  // The browser's own prompt covers a reload or a closed tab; the dialog below
  // covers in-app navigation, which this never sees.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return (
    <EditorShell back={back} onBack={isDirty ? () => setConfirmLeave(true) : undefined}>
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        {post ? <Trans>Edit post</Trans> : <Trans>New post</Trans>}
      </h1>

      {draft?.restored ? (
        <div className="space-y-3 border border-border bg-card p-3">
          <p className="text-muted-foreground text-sm">
            <Trans>Picked up where you left off — this post has not been submitted yet.</Trans>
          </p>
          <Button type="button" variant="outline" tap onClick={draft.onStartOver}>
            <Trans>Start over</Trans>
          </Button>
        </div>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="title">
          {(field) => (
            <Field
              htmlFor={field.name}
              label={t`Title`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id={field.name}
                className="bg-card"
                maxLength={REPORT_TITLE_MAX}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="body">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <div>
                {/* `htmlFor` alone does not name a `contentEditable`, which is
                    not a labelable element, so the editor is pointed back at
                    this label by id. */}
                <label
                  id="post-body-label"
                  htmlFor={field.name}
                  className="mb-1.5 block font-medium text-sm"
                >
                  <Trans>Post text</Trans>
                </label>
                <MarkdownEditor
                  id={field.name}
                  aria-labelledby="post-body-label"
                  aria-invalid={field.state.meta.errors.length > 0}
                  maxLength={REPORT_BODY_MAX}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
                {error ? (
                  <p role="alert" className="mt-1 text-destructive text-xs">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>

        <Section title={t`Event details`}>
          <div className="space-y-4">
            <form.Field name="periodFrom">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`Starts`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    type="datetime-local"
                    className="bg-card"
                    value={toDateTimeLocalValue(field.state.value)}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(fromDateTimeLocalValue(event.target.value))
                    }
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="periodTo">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`Ends`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    type="datetime-local"
                    className="bg-card"
                    value={toDateTimeLocalValue(field.state.value)}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(fromDateTimeLocalValue(event.target.value))
                    }
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="hostName">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`Host`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    className="bg-card"
                    maxLength={REPORT_HOST_NAME_MAX}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            {/* A head count. The wire field is text — older posts hold prose
                there — so the value stays a string and the schema insists on
                digits for anything new. */}
            <form.Field name="participants">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`No. of participants`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    type="number"
                    dir="ltr"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className="bg-card"
                    maxLength={REPORT_PARTICIPANTS_MAX}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
          </div>
        </Section>

        <Section title={t`Place`}>
          {/* Only geoLat/geoLng persist — reports.location_name was dropped in
              migration 010 — so the picker's place name is a search aid. */}
          <form.Subscribe selector={(state) => [state.values.geoLat, state.values.geoLng] as const}>
            {([lat, lng]) => (
              <LocationPicker
                label={t`Where did this happen?`}
                value={
                  lat !== null && lng !== null
                    ? ({ lat, lng, locationName: "" } as LocationInput)
                    : undefined
                }
                onChange={(next) => {
                  form.setFieldValue("geoLat", next ? next.lat : null);
                  form.setFieldValue("geoLng", next ? next.lng : null);
                }}
              />
            )}
          </form.Subscribe>
        </Section>

        <Section title={t`Tags and vouchers`}>
          <div className="space-y-5">
            <form.Field name="tags">
              {(field) => (
                <div>
                  <span className="mb-1.5 block font-medium text-sm">
                    <Trans>Tags</Trans>
                  </span>
                  {tagsQuery.data?.length ? (
                    <TagCombobox
                      items={tagsQuery.data}
                      value={field.state.value}
                      onValueChange={(next) => field.handleChange(next.slice(0, REPORT_MAX_TAGS))}
                      searchLabel={t`Search post tags`}
                      selectedLabel={t`Selected post tags`}
                      listLabel={t`Post tags`}
                      placeholder={t`Search tags`}
                      removeLabel={(tag) => t`Remove ${tag}`}
                    />
                  ) : tagsQuery.isError ? (
                    <div className="space-y-2">
                      <p role="alert" className="text-destructive text-sm">
                        <Trans>Couldn't load tags.</Trans>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        tap
                        onClick={() => tagsQuery.refetch()}
                      >
                        <Trans>Retry</Trans>
                      </Button>
                    </div>
                  ) : null}
                  {getFieldError(field.state.meta.errors) ? (
                    <p role="alert" className="mt-1 text-destructive text-xs">
                      {getFieldError(field.state.meta.errors)}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="vouchers">
              {(field) => (
                <div>
                  <span className="mb-1.5 block font-medium text-sm">
                    <Trans>Related vouchers</Trans>
                  </span>
                  <PostVoucherPicker
                    vouchers={field.state.value}
                    linkedNames={linkedNames}
                    onChange={field.handleChange}
                    disabled={saving}
                    max={REPORT_MAX_VOUCHERS}
                    owner={voucherOwner}
                  />
                  {getFieldError(field.state.meta.errors) ? (
                    <p role="alert" className="mt-1 text-destructive text-xs">
                      {getFieldError(field.state.meta.errors)}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </div>
        </Section>

        <Section title={t`Photos`}>
          <form.Field name="images">
            {(field) => (
              <form.Subscribe selector={(state) => state.values.imageUrl}>
                {(coverUrl) => (
                  <PostImageManager
                    images={field.state.value}
                    coverUrl={coverUrl}
                    onChange={field.handleChange}
                    onCoverChange={(url) => form.setFieldValue("imageUrl", url)}
                    onBusyChange={setImagesBusy}
                    disabled={saving}
                    max={REPORT_MAX_IMAGES}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
        </Section>

        <Section title={t`Links`}>
          <form.Field name="attachments">
            {(field) => (
              <PostAttachmentFields
                attachments={field.state.value}
                onChange={field.handleChange}
                disabled={saving}
                max={REPORT_MAX_ATTACHMENTS}
              />
            )}
          </form.Field>
        </Section>

        <Button type="submit" size="lg" className="w-full" disabled={saving || imagesBusy}>
          {imagesBusy ? (
            <Trans>Uploading photos…</Trans>
          ) : saving ? (
            <Trans>Saving…</Trans>
          ) : post ? (
            <Trans>Save changes</Trans>
          ) : (
            <Trans>Publish</Trans>
          )}
        </Button>
      </form>

      <PostConfirmDialog
        open={confirmLeave}
        title={t`Leave without saving?`}
        confirmLabel={t`Discard changes`}
        onConfirm={() => {
          setConfirmLeave(false);
          // Discard means discard: the parked copy goes with the changes.
          if (draft) clearPostDraft();
          router.history.back();
        }}
        onCancel={() => setConfirmLeave(false)}
      >
        <Trans>Your unsaved changes to this post will be lost.</Trans>
      </PostConfirmDialog>
    </EditorShell>
  );
}

/** An optional group. `<details>` rather than a Collapsible primitive. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border border-border bg-card p-4">
      <summary className="cursor-pointer list-none font-medium text-sm marker:hidden">
        {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

type EditorBack = { label: string; to: string; search?: Record<string, unknown> };

function EditorShell({
  children,
  back,
  onBack,
}: {
  children: ReactNode;
  back?: EditorBack;
  onBack?: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="space-y-4">
      <BackChevron
        label={back?.label ?? t`My posts`}
        to={back?.to ?? "/posts/mine"}
        search={back?.search}
        onClick={onBack}
      />
      {children}
    </div>
  );
}
