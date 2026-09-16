import {
  ReportPayloadTooLargeError,
  type ManagedReportDetail,
} from "@clc/api/features/reports/client";
import { adminReportQueryOptions } from "@clc/api/features/reports/queries";
import { tokenTagsQueryOptions } from "@clc/api/features/deployments/queries";
import {
  REPORT_ATTACHMENT_FILENAME_MAX,
  REPORT_ATTACHMENT_KINDS,
  REPORT_BODY_MAX,
  REPORT_DESCRIPTION_MAX,
  REPORT_HOST_NAME_MAX,
  REPORT_IMAGE_CAPTION_MAX,
  REPORT_PARTICIPANTS_MAX,
  REPORT_TIME_TAKEN_MAX,
  REPORT_TITLE_MAX,
  emptyReportWrite,
  fromDateTimeLocalValue,
  reportToFormValues,
  reportWriteSchema,
  toDateTimeLocalValue,
  type ReportAttachmentWrite,
  type ReportImageWrite,
  type ReportWrite,
} from "@clc/core/features/reports/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { LoadingBlock } from "#/components/admin/loading-block";
import { MarkdownContent } from "#/components/admin/markdown-content";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { SectionHeading } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { clcApi } from "#/lib/api";
import { DEFAULT_POST_SEARCH } from "./post-search";
import { PostGeoField } from "./ui/post-geo-field";
import { useCreatePost, useUpdatePost } from "./use-post-mutations";

export type PostEditorTarget = { mode: "create" } | { mode: "edit"; reportId: string };

/**
 * The console's post editor.
 *
 * A full page rather than a Sheet: a post carries prose, up to fifty images and
 * twenty attachments, and none of that fits a side panel.
 *
 * A superadmin's create publishes immediately, and a superadmin's edit preserves
 * whatever status the post holds. Both are the server's decision, stated on
 * screen rather than predicted.
 */
export function PostEditorPage(target: PostEditorTarget) {
  if (target.mode === "create") {
    return <PostEditorForm initial={emptyReportWrite} previousStatus={null} />;
  }
  return <PostEditorLoader reportId={target.reportId} />;
}

function PostEditorLoader({ reportId }: { reportId: string }) {
  const postQuery = useQuery(adminReportQueryOptions(clcApi.reports, reportId));

  if (postQuery.isPending) return <LoadingBlock rows={10} />;
  if (postQuery.isError || !postQuery.data) {
    return (
      <PageState
        title="Could not load this post"
        message={
          postQuery.error instanceof Error ? postQuery.error.message : "The post was not found."
        }
      />
    );
  }

  const post = postQuery.data;
  return (
    // Keyed on the record: TanStack Form reads defaultValues once.
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
  const navigate = useNavigate();
  const tagsQuery = useQuery(tokenTagsQueryOptions(clcApi.deployments));
  const create = useCreatePost();
  const update = useUpdatePost(previousStatus);

  const saving = create.isPending || update.isPending;

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: reportWriteSchema },
    onSubmit: async ({ value }) => {
      try {
        if (post) {
          await update.mutateAsync({ id: post.id, input: value });
          toast.success("Post saved.");
          void navigate({ to: "/posts/$reportId", params: { reportId: post.id } });
          return;
        }
        const created = await create.mutateAsync(value);
        toast.success("Post published.");
        void navigate({ to: "/posts/$reportId", params: { reportId: created.id } });
      } catch (error) {
        // Values, including uploaded URLs, stay in the form for a retry.
        if (error instanceof ReportPayloadTooLargeError) {
          toast.error("This post is too large to save. Shorten the text or remove some media.");
          return;
        }
        toast.error(error instanceof Error ? error.message : "Could not save the post.");
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumb
        items={[
          { label: "Posts", to: "/posts", search: DEFAULT_POST_SEARCH },
          ...(post
            ? [{ label: post.title, to: "/posts/$reportId", params: { reportId: post.id } }]
            : []),
          { label: post ? "Edit" : "New post" },
        ]}
      />

      <PageHeader
        title={post ? "Edit post" : "New post"}
        actions={
          <Button
            nativeButton={false}
            variant="outline"
            render={
              post ? (
                <Link to="/posts/$reportId" params={{ reportId: post.id }} />
              ) : (
                <Link to="/posts" search={DEFAULT_POST_SEARCH} />
              )
            }
          >
            Cancel
          </Button>
        }
      />

      <p className="text-muted-foreground text-sm">
        {post
          ? "An operator edit keeps the post's current status. Approval and withdrawal are separate actions."
          : "A post you create is approved immediately and appears in the Posts feed."}
      </p>

      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Content</SectionHeading>

          <form.Field name="title">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>Title</Label>
                <Input
                  id={field.name}
                  maxLength={REPORT_TITLE_MAX}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError message={getFieldError(field.state.meta.errors)} />
              </div>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>Feed summary</Label>
                <Textarea
                  id={field.name}
                  rows={3}
                  maxLength={REPORT_DESCRIPTION_MAX}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p className="text-muted-foreground font-data text-xs">
                  {field.state.value.length} / {REPORT_DESCRIPTION_MAX}
                </p>
                <FieldError message={getFieldError(field.state.meta.errors)} />
              </div>
            )}
          </form.Field>

          <form.Field name="body">{(field) => <BodyEditor field={field} />}</form.Field>
        </section>

        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Event details</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="periodFrom">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Starts</Label>
                  <Input
                    id={field.name}
                    type="datetime-local"
                    value={toDateTimeLocalValue(field.state.value)}
                    onChange={(event) =>
                      field.handleChange(fromDateTimeLocalValue(event.target.value))
                    }
                  />
                  <FieldError message={getFieldError(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
            <form.Field name="periodTo">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Ends</Label>
                  <Input
                    id={field.name}
                    type="datetime-local"
                    value={toDateTimeLocalValue(field.state.value)}
                    onChange={(event) =>
                      field.handleChange(fromDateTimeLocalValue(event.target.value))
                    }
                  />
                  <FieldError message={getFieldError(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
            <form.Field name="hostName">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Host</Label>
                  <Input
                    id={field.name}
                    maxLength={REPORT_HOST_NAME_MAX}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError message={getFieldError(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
            <form.Field name="participants">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>No. of participants</Label>
                  <Input
                    id={field.name}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    maxLength={REPORT_PARTICIPANTS_MAX}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError message={getFieldError(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
            <form.Field name="timeTaken">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Duration</Label>
                  <Input
                    id={field.name}
                    maxLength={REPORT_TIME_TAKEN_MAX}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError message={getFieldError(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
          </div>
        </section>

        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Place</SectionHeading>
          {/* reports.location_name was dropped in migration 010, so only the
              coordinates persist. */}
          <form.Subscribe selector={(state) => [state.values.geoLat, state.values.geoLng] as const}>
            {([lat, lng]) => (
              <PostGeoField
                latitude={lat}
                longitude={lng}
                disabled={saving}
                onChange={(next) => {
                  form.setFieldValue("geoLat", next ? next.lat : null);
                  form.setFieldValue("geoLng", next ? next.lng : null);
                }}
              />
            )}
          </form.Subscribe>
        </section>

        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Tags</SectionHeading>
          <form.Field name="tags">
            {(field) =>
              tagsQuery.data?.length ? (
                <TagCombobox
                  items={tagsQuery.data}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  searchLabel="Search post tags"
                  selectedLabel="Selected post tags"
                  listLabel="Post tags"
                  placeholder="Search tags"
                  removeLabel={(tag) => `Remove ${tag}`}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {tagsQuery.isError ? "Could not load the tag vocabulary." : "Loading tags…"}
                </p>
              )
            }
          </form.Field>
        </section>

        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Cover and images</SectionHeading>
          {/* No file picker here: the console does not upload post images. What
              it can do is keep, reorder, caption and remove what is already
              stored — which an assign-all PUT would otherwise erase. */}
          <form.Field name="images">
            {(field) => (
              <form.Subscribe selector={(state) => state.values.imageUrl}>
                {(coverUrl) => (
                  <ImageRows
                    images={field.state.value}
                    coverUrl={coverUrl}
                    disabled={saving}
                    onChange={field.handleChange}
                    onCoverChange={(url) => form.setFieldValue("imageUrl", url)}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
        </section>

        <section className="border-border bg-card flex flex-col gap-4 border p-4">
          <SectionHeading>Attachments</SectionHeading>
          <form.Field name="attachments">
            {(field) => (
              <AttachmentRows
                attachments={field.state.value}
                disabled={saving}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </section>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : post ? "Save changes" : "Publish post"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Write and Preview as mutually exclusive panels.
 *
 * Tabs at every breakpoint, never a side-by-side layout: the console's content
 * column is one column, and a split view would halve the width of both. The body
 * is parsed from a deferred value so typing does not re-parse on every keystroke,
 * and only while Preview is open.
 */
function BodyEditor({
  field,
}: {
  field: {
    name: string;
    state: { value: string; meta: { errors: Array<unknown> } };
    handleBlur: () => void;
    handleChange: (value: string) => void;
  };
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const deferredBody = useDeferredValue(field.state.value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name}>Post text (Markdown)</Label>
      <Tabs value={tab} onValueChange={(next) => setTab(next === "preview" ? "preview" : "write")}>
        <TabsList>
          <TabsTab value="write">Write</TabsTab>
          <TabsTab value="preview">Preview</TabsTab>
        </TabsList>
        <TabsPanel value="write">
          <Textarea
            id={field.name}
            rows={14}
            maxLength={REPORT_BODY_MAX}
            className="font-mono text-xs"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        </TabsPanel>
        <TabsPanel value="preview">
          <div className="border-border min-h-40 border p-4">
            {deferredBody.trim() === "" ? (
              <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
            ) : (
              <MarkdownContent>{deferredBody}</MarkdownContent>
            )}
          </div>
        </TabsPanel>
      </Tabs>
      <FieldError
        message={getFieldError(field.state.meta.errors as Parameters<typeof getFieldError>[0])}
      />
    </div>
  );
}

function ImageRows({
  images,
  coverUrl,
  disabled,
  onChange,
  onCoverChange,
}: {
  images: ReportImageWrite[];
  coverUrl: string | null;
  disabled?: boolean;
  onChange: (images: ReportImageWrite[]) => void;
  onCoverChange: (url: string | null) => void;
}) {
  if (images.length === 0) {
    return <p className="text-muted-foreground text-sm">This post has no images.</p>;
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  }

  return (
    <ul className="flex flex-col gap-3">
      {images.map((image, index) => (
        <li key={image.url} className="border-border flex flex-col gap-2 border p-3">
          <div className="flex items-start gap-3">
            <img
              src={image.url}
              alt=""
              loading="lazy"
              className="bg-muted size-16 shrink-0 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="font-data text-muted-foreground truncate text-xs">{image.url}</p>
              {coverUrl === image.url ? (
                <p className="text-primary text-xs font-medium">Cover</p>
              ) : null}
            </div>
          </div>
          <Input
            aria-label={`Caption for image ${index + 1}`}
            placeholder="Caption"
            maxLength={REPORT_IMAGE_CAPTION_MAX}
            value={image.caption ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                images.map((current, position) =>
                  position === index
                    ? { ...current, caption: event.target.value || null }
                    : current,
                ),
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || index === 0}
              aria-label={`Move image ${index + 1} up`}
              onClick={() => move(index, -1)}
            >
              Up
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || index === images.length - 1}
              aria-label={`Move image ${index + 1} down`}
              onClick={() => move(index, 1)}
            >
              Down
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || coverUrl === image.url}
              onClick={() => onCoverChange(image.url)}
            >
              Use as cover
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={disabled}
              aria-label={`Remove image ${index + 1}`}
              onClick={() => {
                onChange(images.filter((_, position) => position !== index));
                // The cover is a copy of a gallery URL, so removing that row
                // would leave a cover pointing at an image the post no longer
                // shows.
                if (coverUrl === image.url) onCoverChange(null);
              }}
            >
              <HiOutlineTrash />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AttachmentRows({
  attachments,
  disabled,
  onChange,
}: {
  attachments: ReportAttachmentWrite[];
  disabled?: boolean;
  onChange: (attachments: ReportAttachmentWrite[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No attachments.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.kind}:${attachment.url}`}
              className="border-border flex flex-wrap items-center gap-2 border p-3"
            >
              <span className="font-mono text-xs uppercase">{attachment.kind}</span>
              <Input
                className="min-w-0 flex-1 font-mono text-xs"
                aria-label={`Attachment ${index + 1} link`}
                value={attachment.url}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    attachments.map((current, position) =>
                      position === index ? { ...current, url: event.target.value } : current,
                    ),
                  )
                }
              />
              {attachment.kind === "FILE" ? (
                <Input
                  className="w-48"
                  aria-label={`Attachment ${index + 1} file name`}
                  placeholder="File name"
                  maxLength={REPORT_ATTACHMENT_FILENAME_MAX}
                  value={attachment.filename ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      attachments.map((current, position) =>
                        position === index
                          ? { ...current, filename: event.target.value || null }
                          : current,
                      ),
                    )
                  }
                />
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disabled}
                aria-label={`Remove attachment ${index + 1}`}
                onClick={() => onChange(attachments.filter((_, position) => position !== index))}
              >
                <HiOutlineTrash />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-96 max-w-full"
          aria-label="Add an embed link"
          placeholder="https://"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !/^https?:\/\//i.test(draft.trim())}
          onClick={() => {
            const url = draft.trim();
            if (attachments.some((entry) => entry.kind === "EMBED" && entry.url === url)) return;
            setDraft("");
            onChange([
              ...attachments,
              { kind: REPORT_ATTACHMENT_KINDS[1], url, filename: null, byteSize: null },
            ]);
          }}
        >
          <HiOutlinePlus />
          Add link
        </Button>
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}
