import type { LocationInput } from "@clc/core/features/location/logic";
import {
  REPORT_BODY_MAX,
  REPORT_HOST_NAME_MAX,
  REPORT_MAX_ATTACHMENTS,
  REPORT_MAX_IMAGES,
  REPORT_MAX_POOLS,
  REPORT_MAX_TAGS,
  REPORT_MAX_VOUCHERS,
  REPORT_PARTICIPANTS_MAX,
  REPORT_TITLE_MAX,
  type ReportWrite,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "@clc/core/features/reports/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useBlocker, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RiArrowDownSLine } from "react-icons/ri";

import { PublicLocationWarning } from "#/components/public-location-warning";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { Skeleton } from "#/components/ui/skeleton";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import { DeskCanvas, DeskPanel, DeskTitle, DeskTitleRow } from "#/desktop/ui/page";
import {
  type PostEditorSeed,
  type SeedVoucher,
  usePostEditorCreateSeed,
  usePostEditorEditSeed,
  usePostEditorForm,
} from "#/features/posts/hooks/use-post-editor";
import { PostAttachmentFields } from "#/features/posts/ui/post-attachment-fields";
import { PostImageManager } from "#/features/posts/ui/post-image-manager";
import { PostPoolPicker } from "#/features/posts/ui/post-pool-picker";
import { PostVoucherPicker } from "#/features/posts/ui/post-voucher-picker";
import { cn } from "#/lib/utils";

type EditorProps = { mode: "new" } | { mode: "edit"; reportId: string };

type GroupKey = "post" | "event" | "place" | "tags" | "photos" | "links";

const GROUPS: readonly GroupKey[] = ["post", "event", "place", "tags", "photos", "links"];

const FORM_ID = "desk-post-editor";

/**
 * Writing or editing a post on a wide screen: an outline of the form's groups
 * beside a 680px editor, Publish on the title row. The form, its draft,
 * validation and submit come from the same hooks as the phone editor.
 */
export function PostEditorDesk(props: EditorProps) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  if (props.mode === "edit") return <EditLoader reportId={props.reportId} />;
  return <CreateLoader voucher={seedVoucher(search)} />;
}

function CreateLoader({ voucher }: { voucher: SeedVoucher | null }) {
  const created = usePostEditorCreateSeed(voucher);
  if (!created) return <EditorSkeleton title={<Trans>New post</Trans>} />;
  return <EditorForm key={created.formKey} {...created.seed} />;
}

function EditLoader({ reportId }: { reportId: string }) {
  const { postQuery, seed } = usePostEditorEditSeed(reportId);

  if (postQuery.isPending) return <EditorSkeleton title={<Trans>Edit post</Trans>} />;

  if (postQuery.isError || !seed) {
    return (
      <DeskCanvas width="read" className="grid-cols-[200px_minmax(0,680px)] gap-8">
        <div />
        <div className="grid content-start gap-4">
          <DeskTitle>
            <Trans>Edit post</Trans>
          </DeskTitle>
          <DeskPanel className="grid justify-items-start gap-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load this post. You can only edit posts you wrote.</Trans>
            </p>
            <Button
              variant="outline"
              pending={postQuery.isFetching}
              onClick={() => void postQuery.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </DeskPanel>
        </div>
      </DeskCanvas>
    );
  }

  // Keyed on the record: TanStack Form reads defaultValues once.
  return <EditorForm key={seed.post?.id} {...seed} />;
}

function EditorSkeleton({ title }: { title: ReactNode }) {
  const { t } = useLingui();
  return (
    <DeskCanvas width="read" className="grid-cols-[200px_minmax(0,680px)] gap-8">
      <div />
      <div className="grid content-start gap-4">
        <DeskTitle>{title}</DeskTitle>
        <div aria-busy="true" aria-label={t`Loading your post…`} className="grid gap-4">
          <Skeleton className="h-9 w-full rounded-none" />
          <Skeleton className="h-48 w-full rounded-none" />
        </div>
      </div>
    </DeskCanvas>
  );
}

function EditorForm({
  post,
  initial,
  linkedNames,
  linkedPoolNames,
  draft,
  previousStatus,
}: PostEditorSeed) {
  const { t } = useLingui();
  const { form, values, saving, imagesBusy, setImagesBusy, voucherOwner, tagsQuery, discardDraft } =
    usePostEditorForm({ post, initial, draft, previousStatus });

  // In-app navigation away from unsaved changes asks first. A submit in flight
  // navigates on success, so it is never held.
  const blocker = useBlocker({
    shouldBlockFn: () => {
      const state = form.store.state;
      return state.isDirty && !state.isSubmitting;
    },
    enableBeforeUnload: false,
    withResolver: true,
  });

  const labels: Record<GroupKey, string> = {
    post: t`Post`,
    event: t`Event details`,
    place: t`Place`,
    tags: t`Tags and resources`,
    photos: t`Photos`,
    links: t`Links`,
  };
  const filled = groupsWithContent(values);

  const [open, setOpen] = useState<ReadonlySet<GroupKey>>(() => {
    const initiallyOpen = new Set<GroupKey>(["tags"]);
    if (initial.geoLat !== null && initial.geoLng !== null) initiallyOpen.add("place");
    return initiallyOpen;
  });
  const toggle = (key: GroupKey, next: boolean) =>
    setOpen((current) => {
      const updated = new Set(current);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });

  const sectionRefs = useRef(new Map<GroupKey, HTMLElement>());
  const [active, setActive] = useState<GroupKey>("post");
  const jumping = useRef(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<GroupKey, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.group as GroupKey;
          if (entry.isIntersecting) visible.set(key, entry.boundingClientRect.top);
          else visible.delete(key);
        }
        if (jumping.current) return;
        const first = GROUPS.find((key) => visible.has(key));
        if (first) setActive(first);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const element of sectionRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const jumpTo = (key: GroupKey) => {
    setActive(key);
    if (key !== "post") toggle(key, true);
    const element = sectionRefs.current.get(key);
    if (!element) return;
    jumping.current = true;
    element.scrollIntoView({ block: "start", behavior: "smooth" });
    window.setTimeout(() => {
      jumping.current = false;
    }, 600);
  };

  const register = (key: GroupKey) => (element: HTMLElement | null) => {
    if (element) sectionRefs.current.set(key, element);
    else sectionRefs.current.delete(key);
  };

  const group = (key: Exclude<GroupKey, "post">, children: ReactNode, aside?: ReactNode) => (
    <EditorGroup
      key={key}
      id={key}
      title={labels[key]}
      aside={aside}
      open={open.has(key)}
      onOpenChange={(next) => toggle(key, next)}
      sectionRef={register(key)}
    >
      {children}
    </EditorGroup>
  );

  return (
    <DeskCanvas width="read" className="grid-cols-[200px_minmax(0,680px)] gap-8">
      <nav aria-label={t`Post`} className="sticky top-0 grid content-start gap-0.5 self-start">
        {GROUPS.map((key) => (
          <button
            key={key}
            type="button"
            aria-current={active === key ? "location" : undefined}
            onClick={() => jumpTo(key)}
            className={cn(
              "flex h-[34px] items-center gap-2 px-3 text-start text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
              active === key &&
                "bg-accent font-semibold text-foreground shadow-[inset_2px_0_0_var(--color-primary)]",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{labels[key]}</span>
            {filled.has(key) ? (
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="grid min-w-0 content-start gap-[18px]">
        {/* Publish stays in reach while the form scrolls under it. */}
        <div className="sticky top-0 z-10 -my-2 bg-background py-2">
          <DeskTitleRow
            title={post ? <Trans>Edit post</Trans> : <Trans>New post</Trans>}
            actions={
              <Button type="submit" form={FORM_ID} pending={saving || imagesBusy}>
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
            }
          />
        </div>

        {draft?.restored ? (
          <div className="flex items-center gap-3 border border-border border-s-[3px] border-s-primary bg-card px-4 py-3.5">
            <p className="min-w-0 flex-1 text-sm">
              <Trans>Picked up where you left off — this post has not been submitted yet.</Trans>
            </p>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={draft.onStartOver}
            >
              <Trans>Start over</Trans>
            </Button>
          </div>
        ) : null}

        <form
          id={FORM_ID}
          aria-label={post ? t`Edit post` : t`New post`}
          className="grid min-w-0 gap-[18px]"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <section
            ref={register("post")}
            data-group="post"
            aria-label={labels.post}
            className="grid scroll-mt-7 gap-[18px]"
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
                  <div className="grid gap-1.5">
                    {/* `htmlFor` alone does not name a `contentEditable`, so the
                        editor is pointed back at this label by id. */}
                    <label
                      id="desk-post-body-label"
                      htmlFor={field.name}
                      className="text-sm font-medium"
                    >
                      <Trans>Post text</Trans>
                    </label>
                    <MarkdownEditor
                      id={field.name}
                      aria-labelledby="desk-post-body-label"
                      aria-invalid={field.state.meta.errors.length > 0}
                      maxLength={REPORT_BODY_MAX}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                    />
                    {error ? (
                      <p role="alert" className="text-destructive text-xs">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>
          </section>

          <div className="grid border-border border-b">
            {group(
              "event",
              <div className="grid gap-4">
                <div className="grid grid-cols-2 items-start gap-4">
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
                </div>
                <div className="grid grid-cols-2 items-start gap-4">
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
                  {/* A head count. The wire field is text, so the value stays a
                      string and the schema insists on digits for anything new. */}
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
                          className="bg-card font-mono"
                          maxLength={REPORT_PARTICIPANTS_MAX}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>
              </div>,
            )}

            {group(
              "place",
              <div className="grid gap-4">
                {/* Only geoLat/geoLng persist, so the picker's place name is a
                    search aid. */}
                <LocationPicker
                  label={t`Where did this happen?`}
                  value={
                    values.geoLat !== null && values.geoLng !== null
                      ? ({
                          lat: values.geoLat,
                          lng: values.geoLng,
                          locationName: "",
                        } as LocationInput)
                      : undefined
                  }
                  markerStyle={{ icon: values.markerIcon, color: values.markerColor }}
                  onChange={(next) => {
                    form.setFieldValue("geoLat", next ? next.lat : null);
                    form.setFieldValue("geoLng", next ? next.lng : null);
                  }}
                />
                <MarkerStylePicker
                  mode="report"
                  value={values.markerIcon}
                  onChange={(next) => form.setFieldValue("markerIcon", next)}
                />
                <PublicLocationWarning />
              </div>,
            )}

            {group(
              "tags",
              <div className="grid gap-5">
                <p className="text-muted-foreground text-xs">
                  <Trans>Link at least one voucher or pool.</Trans>
                </p>
                <div className="grid grid-cols-2 items-start gap-4">
                  <form.Field name="vouchers">
                    {(field) => (
                      <div className="grid min-w-0 gap-1.5">
                        <span className="text-sm font-medium">
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
                        <FieldErrorText error={getFieldError(field.state.meta.errors)} />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="pools">
                    {(field) => (
                      <div className="grid min-w-0 gap-1.5">
                        <span className="text-sm font-medium">
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
                        <FieldErrorText error={getFieldError(field.state.meta.errors)} />
                      </div>
                    )}
                  </form.Field>
                </div>
                <form.Field name="tags">
                  {(field) => (
                    <div className="grid gap-1.5">
                      <span className="text-sm font-medium">
                        <Trans>Tags</Trans>
                      </span>
                      {tagsQuery.data?.length ? (
                        <TagCombobox
                          items={tagsQuery.data}
                          value={field.state.value}
                          onValueChange={(next) =>
                            field.handleChange(next.slice(0, REPORT_MAX_TAGS))
                          }
                          searchLabel={t`Search post tags`}
                          selectedLabel={t`Selected post tags`}
                          listLabel={t`Post tags`}
                          placeholder={t`Search tags`}
                          removeLabel={(tag) => t`Remove ${tag}`}
                        />
                      ) : tagsQuery.isError ? (
                        <div className="flex items-center gap-3">
                          <p role="alert" className="text-destructive text-sm">
                            <Trans>Couldn't load tags.</Trans>
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            pending={tagsQuery.isFetching}
                            onClick={() => void tagsQuery.refetch()}
                          >
                            <Trans>Retry</Trans>
                          </Button>
                        </div>
                      ) : null}
                      <FieldErrorText error={getFieldError(field.state.meta.errors)} />
                    </div>
                  )}
                </form.Field>
              </div>,
            )}

            {group(
              "photos",
              <form.Field name="images">
                {(field) => (
                  <PostImageManager
                    images={field.state.value}
                    coverUrl={values.imageUrl}
                    onChange={field.handleChange}
                    onCoverChange={(url) => form.setFieldValue("imageUrl", url)}
                    onBusyChange={setImagesBusy}
                    disabled={saving}
                    max={REPORT_MAX_IMAGES}
                  />
                )}
              </form.Field>,
              values.images.length > 0 ? <PhotoCount images={values.images} /> : null,
            )}

            {group(
              "links",
              <form.Field name="attachments">
                {(field) => (
                  <PostAttachmentFields
                    attachments={field.state.value}
                    onChange={field.handleChange}
                    disabled={saving}
                    max={REPORT_MAX_ATTACHMENTS}
                  />
                )}
              </form.Field>,
            )}
          </div>
        </form>
      </div>

      <DialogRoot
        open={blocker.status === "blocked"}
        onOpenChange={(next) => {
          if (!next && blocker.status === "blocked") blocker.reset();
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="rounded-none border border-border bg-card shadow-none">
            <DialogTitle>{t`Leave without saving?`}</DialogTitle>
            <p className="mt-3 text-muted-foreground text-sm">
              <Trans>Your unsaved changes to this post will be lost.</Trans>
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (blocker.status === "blocked") blocker.reset();
                }}
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (blocker.status !== "blocked") return;
                  discardDraft();
                  blocker.proceed();
                }}
              >
                {t`Discard changes`}
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </DeskCanvas>
  );
}

function PhotoCount({ images }: { images: readonly unknown[] }) {
  const max = REPORT_MAX_IMAGES;
  return (
    <span className="text-muted-foreground text-xs font-normal">
      <Trans>
        {images.length} of {max}
      </Trans>
    </span>
  );
}

function FieldErrorText({ error }: { error: string | undefined | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {error}
    </p>
  );
}

/** One optional group: a 44px row that opens in place, its rule above it. */
function EditorGroup({
  id,
  title,
  aside,
  open,
  onOpenChange,
  sectionRef,
  children,
}: {
  id: GroupKey;
  title: string;
  aside?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionRef: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const panelId = `desk-post-group-${id}`;
  return (
    <section
      ref={sectionRef}
      data-group={id}
      aria-label={title}
      className="scroll-mt-7 border-border border-t"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex h-11 w-full items-center gap-2 text-start text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        <span>{title}</span>
        {aside}
        <RiArrowDownSLine
          aria-hidden="true"
          className={cn("ms-auto size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open} className="pt-1 pb-5">
        {children}
      </div>
    </section>
  );
}

/** Which groups hold something, for the outline's marks. */
function groupsWithContent(values: ReportWrite): ReadonlySet<GroupKey> {
  const filled = new Set<GroupKey>();
  if (values.title.trim() || values.body.trim()) filled.add("post");
  // The period is seeded with the moment of writing, so it alone says nothing.
  if (values.hostName.trim() || values.participants.trim()) filled.add("event");
  if (values.geoLat !== null && values.geoLng !== null) filled.add("place");
  if (values.tags.length || values.vouchers.length || values.pools.length) filled.add("tags");
  if (values.images.length) filled.add("photos");
  if (values.attachments.length) filled.add("links");
  return filled;
}

function seedVoucher(search: Record<string, unknown>): SeedVoucher | null {
  const voucher = search.voucher;
  const chainRaw = search.chainId;
  const chainId = typeof chainRaw === "number" ? chainRaw : Number(chainRaw);
  if (typeof voucher !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(voucher)) return null;
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  return {
    chainId,
    address: voucher,
    name: typeof search.voucherName === "string" ? search.voucherName : undefined,
  };
}
