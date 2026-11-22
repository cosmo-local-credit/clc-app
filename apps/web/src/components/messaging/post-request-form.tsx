import { BackendApiError } from "@clc/api/client/errors";
import { CONVERSATION_INTRO_MAX } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Textarea } from "#/components/ui/textarea";
import { useReport } from "#/features/home/hooks/use-reports";
import { useRequestPostContact } from "#/features/messaging/hooks/use-post-requests";
import { useMyPost } from "#/features/posts/hooks/use-my-posts";

export function PostRequestForm({
  postId,
  onOpenThread,
}: {
  postId: string;
  onOpenThread: (id: number) => void;
}) {
  const { t } = useLingui();
  const introId = useId();
  const [intro, setIntro] = useState("");
  const post = useReport(postId);
  const ownedPost = useMyPost(postId);
  const request = useRequestPostContact(postId);
  const conversationId = request.data?.status === "accepted" ? request.data.conversationId : null;

  if (ownedPost.data?.id === postId) {
    return (
      <p role="alert" className="text-xs text-destructive">
        <Trans>You can't message yourself.</Trans>
      </p>
    );
  }
  if (ownedPost.isPending) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        <Trans>Loading recipients…</Trans>
      </p>
    );
  }
  if (
    ownedPost.isError &&
    !(ownedPost.error instanceof BackendApiError && ownedPost.error.status === 404)
  ) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Trans>Couldn't load recipients.</Trans>
        </p>
        <Button
          type="button"
          variant="outline"
          tap
          pending={ownedPost.isFetching}
          onClick={() => void ownedPost.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  return (
    <form
      className="min-h-0 space-y-3 overflow-y-auto pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (post.data && !post.isError && !request.isPending && !request.isSuccess)
          request.mutate(intro);
      }}
    >
      {post.data ? (
        <Link
          className="block break-words text-sm font-medium underline underline-offset-2"
          to="/posts/$reportId"
          params={{ reportId: postId }}
        >
          <Trans>Post: {post.data.title}</Trans>
        </Link>
      ) : null}
      {conversationId !== null ? (
        <Button type="button" variant="outline" tap onClick={() => onOpenThread(conversationId)}>
          <Trans>Open conversation</Trans>
        </Button>
      ) : request.data?.status === "declined" ? (
        <p role="status" className="text-muted-foreground text-sm">
          <Trans>Declined</Trans>
        </p>
      ) : request.data?.status === "accepted" ? (
        <p role="status" className="text-muted-foreground text-sm">
          <Trans>Closed</Trans>
        </p>
      ) : request.isSuccess ? (
        <p role="status" className="text-muted-foreground text-sm">
          <Trans>The author can open a conversation by accepting your request.</Trans>
        </p>
      ) : post.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load this post.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={post.isFetching}
            onClick={() => void post.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : post.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Loading post…</Trans>
        </p>
      ) : !post.data ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Post not found.</Trans>
        </p>
      ) : (
        <>
          <Field label={t`Introduce yourself`} htmlFor={introId}>
            <Textarea
              id={introId}
              value={intro}
              maxLength={CONVERSATION_INTRO_MAX}
              placeholder={t`Optional`}
              onChange={(event) => setIntro(event.target.value)}
            />
          </Field>
          {request.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {request.error instanceof BackendApiError && request.error.status === 429 ? (
                <Trans>You've sent too many requests today. Try again tomorrow.</Trans>
              ) : (
                <Trans>Couldn't send the request. Try again.</Trans>
              )}
            </p>
          ) : null}
        </>
      )}
      {post.data && !post.isError && !request.isSuccess ? (
        <Button type="submit" tap pending={request.isPending}>
          <Trans>Send request</Trans>
        </Button>
      ) : null}
    </form>
  );
}
