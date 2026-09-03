import {
  ReportPayloadTooLargeError,
  type ManagedReportDetail,
} from "@clc/api/features/reports/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import {
  REPORT_BODY_MAX,
  REPORT_DESCRIPTION_MAX,
  REPORT_HOST_NAME_MAX,
  REPORT_MAX_ATTACHMENTS,
  REPORT_MAX_IMAGES,
  REPORT_MAX_TAGS,
  REPORT_MAX_VOUCHERS,
  REPORT_PARTICIPANTS_MAX,
  REPORT_TIME_TAKEN_MAX,
  REPORT_TITLE_MAX,
  emptyReportWrite,
  fromDateTimeLocalValue,
  reportToFormValues,
  reportWriteSchema,
  toDateTimeLocalValue,
  voucherRefKey,
  type ReportWrite,
} from "@clc/core/features/reports/logic";
import { getFieldError, useForm, useStore } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { Skeleton } from "#/components/ui/skeleton";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { Toggle } from "#/components/ui/toggle";
import { BackChevron } from "#/components/wallet";
import { useTokenTags } from "#/hooks/use-deployment";
import { useMyPost } from "#/features/posts/hooks/use-my-posts";
import { useCreatePost, useUpdatePost } from "#/features/posts/hooks/use-post-mutations";
import { PostAttachmentFields } from "./post-attachment-fields";
import { PostConfirmDialog } from "./post-confirm-dialog";
import { PostImageManager } from "./post-image-manager";
import { PostVoucherPicker } from "./post-voucher-picker";

export type PostEditorTarget = { mode: "create" } | { mode: "edit"; reportId: string };

/**
 * Writing or editing one post.
 *
 * A full-bleed screen that flows top to bottom — no card wrapper, no centering,
 * no max-width shell. Title is the only required field, and everything else is
 * behind a `<details>` group so a quick post stays quick.
 */
export function PostEditorPage(target: PostEditorTarget) {
  if (target.mode === "create") {
    return <PostEditorForm initial={emptyReportWrite} previousStatus={null} />;
  }
  return <PostEditorLoader reportId={target.reportId} />;
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
        <Button variant="outline" size="sm" className="bg-card" onClick={() => postQuery.refetch()}>
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
      previousStatus={post.status}
    />
  );
}

function PostEditorForm({
  post,
  initial,
  previousStatus,
}: {
  post?: ManagedReportDetail;
  initial: ReportWrite;
  previousStatus: ManagedReportDetail["status"] | null;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const tagsQuery = useTokenTags();
  const create = useCreatePost();
  const update = useUpdatePost(previousStatus);

  /** Bytes in flight. Save would otherwise persist the list from before them. */
  const [imagesBusy, setImagesBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmApprovedEdit, setConfirmApprovedEdit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const saving = create.isPending || update.isPending;
  const wasApproved = previousStatus === "APPROVED";

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
          toast.success(t`Submitted for approval.`);
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

  // The browser's own prompt covers a reload or a closed tab; the dialog below
  // covers in-app navigation, which this never sees.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const linkedNames = new Map(
    (post?.vouchers ?? []).map((voucher) => [
      voucherRefKey({ chainId: voucher.chainId, address: voucher.address }),
      voucher.name,
    ]),
  );

  function submit() {
    setConfirmApprovedEdit(false);
    void form.handleSubmit();
  }

  return (
    <EditorShell onBack={isDirty ? () => setConfirmLeave(true) : undefined}>
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        {post ? <Trans>Edit post</Trans> : <Trans>New post</Trans>}
      </h1>

      {wasApproved ? (
        <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>
            This post is published. Saving changes sends it back for approval, so it leaves the
            Posts feed until it is approved again.
          </Trans>
        </p>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (wasApproved) {
            setConfirmApprovedEdit(true);
            return;
          }
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

        <form.Field name="description">
          {(field) => (
            <Field
              htmlFor={field.name}
              label={t`Summary`}
              hint={t`Shown in the Posts feed`}
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id={field.name}
                rows={3}
                className="bg-card"
                maxLength={REPORT_DESCRIPTION_MAX}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <Counter value={field.state.value.length} max={REPORT_DESCRIPTION_MAX} />
            </Field>
          )}
        </form.Field>

        <form.Field name="body">
          {(field) => (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor={field.name} className="block font-medium text-sm">
                  <Trans>Post text</Trans>
                </label>
                {/* One pressed/unpressed control, not a segmented pair and never
                    a side-by-side layout: there is no room for two panes at
                    360px. Component state, so Back does not step through it. */}
                <Toggle
                  variant="outline"
                  pressed={preview}
                  onPressedChange={setPreview}
                  aria-label={t`Preview`}
                >
                  <Trans>Preview</Trans>
                </Toggle>
              </div>

              {preview ? (
                <div className="min-h-24 border border-border bg-card p-3">
                  {field.state.value.trim() === "" ? (
                    <p className="text-muted-foreground text-sm">
                      <Trans>Nothing to preview yet.</Trans>
                    </p>
                  ) : (
                    // Parsed only while Preview is pressed.
                    <MarkdownContent>{field.state.value}</MarkdownContent>
                  )}
                </div>
              ) : (
                <Textarea
                  id={field.name}
                  rows={8}
                  maxLength={REPORT_BODY_MAX}
                  className="bg-card font-mono text-[0.8125rem]"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}

              {getFieldError(field.state.meta.errors) ? (
                <p role="alert" className="mt-1 text-destructive text-xs">
                  {getFieldError(field.state.meta.errors)}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground text-xs">
                  <Trans>Markdown: **bold**, # headings, - lists, [links](https://…)</Trans>
                </p>
              )}
            </div>
          )}
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

            <form.Field name="participants">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`Participants`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    className="bg-card"
                    maxLength={REPORT_PARTICIPANTS_MAX}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="timeTaken">
              {(field) => (
                <Field
                  htmlFor={field.name}
                  label={t`Duration`}
                  error={getFieldError(field.state.meta.errors)}
                >
                  <Input
                    id={field.name}
                    className="bg-card"
                    maxLength={REPORT_TIME_TAKEN_MAX}
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
                        size="sm"
                        className="h-9 bg-card"
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

        <Section title={t`Attachments`}>
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

        <Button type="submit" className="h-11 w-full" disabled={saving || imagesBusy}>
          {imagesBusy ? (
            <Trans>Uploading photos…</Trans>
          ) : saving ? (
            <Trans>Saving…</Trans>
          ) : post ? (
            <Trans>Save changes</Trans>
          ) : (
            <Trans>Submit for approval</Trans>
          )}
        </Button>
      </form>

      <PostConfirmDialog
        open={confirmApprovedEdit}
        title={t`Send this post back for approval?`}
        confirmLabel={t`Save and resubmit`}
        onConfirm={submit}
        onCancel={() => setConfirmApprovedEdit(false)}
      >
        <Trans>
          Your changes leave the Posts feed until a steward approves them again. Approval cannot be
          undone once given.
        </Trans>
      </PostConfirmDialog>

      <PostConfirmDialog
        open={confirmLeave}
        title={t`Leave without saving?`}
        confirmLabel={t`Discard changes`}
        onConfirm={() => {
          setConfirmLeave(false);
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

function Counter({ value, max }: { value: number; max: number }) {
  const near = value > max * 0.9;
  return (
    <p
      className={`mt-1 text-right text-xs tabular-nums ${
        near ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {value} / {max}
    </p>
  );
}

function EditorShell({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const { t } = useLingui();
  return (
    <div className="space-y-4">
      <BackChevron label={t`My posts`} to="/posts/mine" onClick={onBack} />
      {children}
    </div>
  );
}
