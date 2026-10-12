import { adminReportQueryOptions } from "@clc/api/features/reports/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatByteSize } from "@clc/core/features/reports/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiOutlineCheck, HiOutlinePencil, HiOutlineTrash } from "react-icons/hi";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { LoadingBlock } from "#/components/admin/loading-block";
import { MarkdownContent } from "#/components/admin/markdown-content";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import {
  RecordAbsent,
  RecordData,
  RecordExternalLink,
  RecordOwner,
  RecordRow,
} from "#/components/admin/record-fields";
import { SectionHeading } from "#/components/admin/section-heading";
import { StateBadge } from "#/components/admin/state-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { DEFAULT_POST_SEARCH } from "./post-search";
import { PostConfirmDialog } from "./ui/post-confirm-dialog";
import { useApprovePost, useDeletePost } from "./use-post-mutations";

/**
 * One post, in any status, for review.
 *
 * The article is the primary column and the metadata a flat secondary panel.
 * Everything an assign-all `PUT` will replace is shown, including the two that
 * are easy to miss — attachments and image metadata — because a field an
 * operator cannot see is one they cannot notice the editor about to erase.
 */
export function PostDetailPage({ reportId }: { reportId: string }) {
  const navigate = useNavigate();
  const postQuery = useQuery(adminReportQueryOptions(clcApi.reports, reportId));
  const post = postQuery.data;

  const [confirm, setConfirm] = useState<"approve" | "delete" | null>(null);
  const approve = useApprovePost();
  const remove = useDeletePost(post?.status);

  if (postQuery.isPending) return <LoadingBlock rows={10} />;
  if (postQuery.isError || !post) {
    return (
      <PageState
        title="Could not load this post"
        message={
          postQuery.error instanceof Error ? postQuery.error.message : "The post was not found."
        }
      />
    );
  }

  async function run() {
    if (!confirm) return;
    try {
      if (confirm === "approve") {
        await approve.mutateAsync(reportId);
        toast.success("Post approved.");
        setConfirm(null);
        return;
      }
      await remove.mutateAsync(reportId);
      toast.success("Post deleted.");
      setConfirm(null);
      // Only after the delete succeeds: leaving first would take the operator
      // back to a table that still lists the row.
      void navigate({ to: "/posts", search: DEFAULT_POST_SEARCH });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The action failed.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumb
        items={[
          { label: "Posts", to: "/posts", search: DEFAULT_POST_SEARCH },
          { label: post.title },
        ]}
      />

      <PageHeader
        title={post.title}
        actions={
          <>
            {post.status === "APPROVED" ? null : (
              <Button
                type="button"
                variant="outline"
                disabled={approve.isPending}
                onClick={() => setConfirm("approve")}
              >
                <HiOutlineCheck />
                Approve
              </Button>
            )}
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link to="/posts/$reportId/edit" params={{ reportId }} />}
            >
              <HiOutlinePencil />
              Edit
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => setConfirm("delete")}
            >
              <HiOutlineTrash />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <section className="border-border bg-card border p-4">
            <SectionHeading>Article</SectionHeading>
            {post.description ? (
              <p className="mt-3 text-sm leading-6">{post.description}</p>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">No feed summary.</p>
            )}
            {post.body ? (
              <MarkdownContent className="mt-4">{post.body}</MarkdownContent>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">No post text.</p>
            )}
          </section>

          <section className="border-border bg-card border p-4">
            <SectionHeading>Images ({post.images.length})</SectionHeading>
            {post.images.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No images.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {post.images.map((image, index) => (
                  <li key={image.url} className="border-border flex gap-3 border p-3">
                    <img
                      src={image.url}
                      alt=""
                      loading="lazy"
                      className="bg-muted size-16 shrink-0 object-cover"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-data">
                        {index + 1}. {image.maxWidth ?? "?"}×{image.maxHeight ?? "?"}
                        {formatByteSize(image.byteSize)
                          ? ` · ${formatByteSize(image.byteSize)}`
                          : ""}
                      </p>
                      {/* The editor's display box, which is not a scaled version
                          of the intrinsic pair above. Imported rows carry one. */}
                      {image.width !== null || image.height !== null ? (
                        <p className="text-muted-foreground font-data">
                          display box {image.width ?? "?"}×{image.height ?? "?"}
                        </p>
                      ) : null}
                      <p className="mt-1 truncate">{image.caption ?? "No caption"}</p>
                      <RecordExternalLink href={image.url} />
                      {post.imageUrl === image.url ? (
                        <Badge variant="outline" className="mt-1 font-mono text-xs">
                          cover
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-border bg-card border p-4">
            <SectionHeading>Attachments ({post.attachments.length})</SectionHeading>
            {post.attachments.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No attachments.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {post.attachments.map((attachment) => (
                  <li
                    key={`${attachment.kind}:${attachment.url}`}
                    className="border-border flex flex-wrap items-center gap-2 border p-3 text-xs"
                  >
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {attachment.kind}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {attachment.filename ?? attachment.url}
                    </span>
                    {formatByteSize(attachment.byteSize) ? (
                      <span className="font-data">{formatByteSize(attachment.byteSize)}</span>
                    ) : null}
                    <RecordExternalLink href={attachment.url} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="border-border bg-card border">
            <div className="border-border border-b p-4">
              <SectionHeading>Status</SectionHeading>
              <div className="mt-3">
                <StateBadge state={post.status} kind="post" />
              </div>
              {post.status === "APPROVED" ? (
                <p className="text-muted-foreground mt-3 text-xs leading-5">
                  Author edits require approval again.
                </p>
              ) : (
                <p className="text-muted-foreground mt-3 text-xs leading-5">
                  Approval cannot be undone.
                </p>
              )}
            </div>

            <dl>
              <RecordRow label="Author">
                <RecordOwner address={post.authorAddress} />
              </RecordRow>
              <RecordRow label="Created">
                <RecordData>{formatDateTime(post.createdAt)}</RecordData>
              </RecordRow>
              <RecordRow label="Updated">
                <RecordData>{formatDateTime(post.updatedAt)}</RecordData>
              </RecordRow>
              <RecordRow label="Period">
                {post.periodFrom || post.periodTo ? (
                  <RecordData>
                    {formatDateTime(post.periodFrom)} → {formatDateTime(post.periodTo)}
                  </RecordData>
                ) : (
                  <RecordAbsent>Not set</RecordAbsent>
                )}
              </RecordRow>
              <RecordRow label="Place">
                {post.lat !== null && post.lng !== null ? (
                  <RecordData>
                    {post.lat}, {post.lng}
                  </RecordData>
                ) : (
                  <RecordAbsent>Not set</RecordAbsent>
                )}
              </RecordRow>
              <RecordRow label="Host">
                {post.hostName ? (
                  <span>{post.hostName}</span>
                ) : (
                  <RecordAbsent>Not set</RecordAbsent>
                )}
              </RecordRow>
              <RecordRow label="Participants">
                {post.participants ? (
                  <span>{post.participants}</span>
                ) : (
                  <RecordAbsent>Not set</RecordAbsent>
                )}
              </RecordRow>
              <RecordRow label="Duration">
                {post.timeTaken ? (
                  <span>{post.timeTaken}</span>
                ) : (
                  <RecordAbsent>Not set</RecordAbsent>
                )}
              </RecordRow>
            </dl>
          </section>

          <section className="border-border bg-card border p-4">
            <SectionHeading>Tags</SectionHeading>
            {post.tags.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No tags.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="font-mono text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <section className="border-border bg-card border p-4">
            <SectionHeading>Linked vouchers</SectionHeading>
            {post.vouchers.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No linked vouchers.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {post.vouchers.map((voucher) => (
                  <li key={voucher.id} className="flex items-center justify-between gap-2">
                    <Link
                      to="/vouchers/$address"
                      params={{ address: voucher.address }}
                      search={{ tab: "offerings" }}
                      className="min-w-0 truncate underline-offset-4 hover:underline"
                    >
                      {voucher.name}
                    </Link>
                    <span className="font-data text-muted-foreground shrink-0 text-xs">
                      {formatVoucherAddress(voucher.address)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <PostConfirmDialog
        open={confirm === "approve"}
        title="Approve this post?"
        description={`"${post.title}" becomes visible in the Posts feed. There is no unapprove — only an edit by its author sends it back for review.`}
        confirmLabel="Approve"
        pending={approve.isPending}
        onConfirm={() => void run()}
        onCancel={() => setConfirm(null)}
      />

      <PostConfirmDialog
        open={confirm === "delete"}
        title="Delete this post?"
        description={`"${post.title}" is deleted permanently, along with its tags, voucher links, images and attachments. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        pending={remove.isPending}
        onConfirm={() => void run()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
