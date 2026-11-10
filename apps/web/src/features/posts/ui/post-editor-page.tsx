import type { LocationInput } from "@clc/core/features/location/logic";
import {
  REPORT_BODY_MAX,
  REPORT_HOST_NAME_MAX,
  REPORT_MAX_ATTACHMENTS,
  REPORT_MAX_IMAGES,
  REPORT_MAX_TAGS,
  REPORT_MAX_VOUCHERS,
  REPORT_MAX_POOLS,
  REPORT_PARTICIPANTS_MAX,
  REPORT_TITLE_MAX,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "@clc/core/features/reports/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { Skeleton } from "#/components/ui/skeleton";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { BackChevron } from "#/components/wallet";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import {
  type PostEditorBack,
  type PostEditorSeed,
  type SeedVoucher,
  usePostEditorCreateSeed,
  usePostEditorEditSeed,
  usePostEditorForm,
} from "#/features/posts/hooks/use-post-editor";
import { PostAttachmentFields } from "./post-attachment-fields";
import { PostConfirmDialog } from "./post-confirm-dialog";
import { PostImageManager } from "./post-image-manager";
import { PostVoucherPicker } from "./post-voucher-picker";
import { PostPoolPicker } from "./post-pool-picker";

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

function PostEditorCreate({ voucher }: { voucher: SeedVoucher | null }) {
  const { t } = useLingui();
  const created = usePostEditorCreateSeed(voucher);

  if (!created) {
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

  return <PostEditorForm key={created.formKey} {...created.seed} />;
}

function PostEditorLoader({ reportId }: { reportId: string }) {
  const { t } = useLingui();
  const { postQuery, seed } = usePostEditorEditSeed(reportId);

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

  if (postQuery.isError || !seed) {
    return (
      <EditorShell>
        <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Couldn't load this post. You can only edit posts you wrote.</Trans>
        </p>
        <Button
          variant="outline"
          tap
          pending={postQuery.isFetching}
          onClick={() => void postQuery.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </EditorShell>
    );
  }

  // Keyed on the record: TanStack Form reads defaultValues once, so a reused
  // instance would keep showing the previously loaded post.
  return <PostEditorForm key={seed.post?.id} {...seed} />;
}

function PostEditorForm({
  post,
  initial,
  linkedNames,
  linkedPoolNames,
  back,
  draft,
  previousStatus,
}: PostEditorSeed) {
  const { t } = useLingui();
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const {
    form,
    saving,
    isDirty,
    imagesBusy,
    setImagesBusy,
    voucherOwner,
    tagsQuery,
    discardDraft,
  } = usePostEditorForm({ post, initial, draft, previousStatus });

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

        <Section title={t`Place`} defaultOpen={initial.geoLat !== null && initial.geoLng !== null}>
          {/* Only geoLat/geoLng persist — reports.location_name was dropped in
              migration 010 — so the picker's place name is a search aid. */}
          <form.Subscribe
            selector={(state) =>
              [
                state.values.geoLat,
                state.values.geoLng,
                state.values.markerIcon,
                state.values.markerColor,
              ] as const
            }
          >
            {([lat, lng, markerIcon, markerColor]) => (
              <div className="space-y-4">
                <LocationPicker
                  label={t`Where did this happen?`}
                  value={
                    lat !== null && lng !== null
                      ? ({ lat, lng, locationName: "" } as LocationInput)
                      : undefined
                  }
                  markerStyle={{ icon: markerIcon, color: markerColor }}
                  onChange={(next) => {
                    form.setFieldValue("geoLat", next ? next.lat : null);
                    form.setFieldValue("geoLng", next ? next.lng : null);
                  }}
                />
                <MarkerStylePicker
                  mode="report"
                  value={markerIcon}
                  onChange={(next) => form.setFieldValue("markerIcon", next)}
                />
              </div>
            )}
          </form.Subscribe>
          <div className="mt-3">
            <PublicLocationWarning />
          </div>
        </Section>

        <Section title={t`Tags and resources`} defaultOpen>
          <div className="space-y-5">
            <p className="text-muted-foreground text-xs">
              <Trans>Link at least one voucher or pool.</Trans>
            </p>
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
                        pending={tagsQuery.isFetching}
                        onClick={() => void tagsQuery.refetch()}
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

            <form.Field name="pools">
              {(field) => (
                <div>
                  <span className="mb-1.5 block font-medium text-sm">
                    <Trans>Related pools</Trans>
                  </span>
                  <PostPoolPicker
                    pools={field.state.value}
                    linkedNames={linkedPoolNames}
                    onChange={field.handleChange}
                    disabled={saving}
                    max={REPORT_MAX_POOLS}
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

        <Button type="submit" tap className="w-full" pending={saving || imagesBusy}>
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
          discardDraft();
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
function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="border border-border bg-card p-4" open={defaultOpen || undefined}>
      <summary className="cursor-pointer list-none font-medium text-sm marker:hidden">
        {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function EditorShell({
  children,
  back,
  onBack,
}: {
  children: ReactNode;
  back?: PostEditorBack;
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
