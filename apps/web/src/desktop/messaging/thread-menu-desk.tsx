import {
  ABUSE_REPORT_COMMENT_MAX,
  type Conversation,
  conversationActions,
  type Message,
} from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiMore2Fill } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { Textarea } from "#/components/ui/textarea";
import {
  useBlockPeer,
  useReportPeer,
  useSetConversationStatus,
} from "#/features/messaging/hooks/use-conversation-actions";

type Action = "revoke" | "block" | "report";

/**
 * The thread's menu: Revoke, Block (or Unblock) and Report, each confirmed in
 * a dialog. A report carries the newest message the peer sent, when there is one.
 */
export function ThreadMenuDesk({
  conversation,
  messages,
}: {
  conversation: Conversation;
  messages: readonly Message[];
}) {
  const { t } = useLingui();
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [comment, setComment] = useState("");
  const actions = conversationActions(conversation);
  const setStatus = useSetConversationStatus(conversation.id);
  const block = useBlockPeer(conversation.id);
  const report = useReportPeer();
  const peer = conversation.peer;
  const reported = [...messages].reverse().find((message) => message.sender === "peer");

  if (!peer || (!actions.canRevoke && !actions.canBlock && !actions.canReport)) return null;

  function choose(next: Action) {
    setMenuOpen(false);
    setAction(next);
  }

  function close() {
    setAction(null);
    setComment("");
    setStatus.reset();
    block.reset();
    report.reset();
  }

  function confirm() {
    if (!peer) return;
    if (action === "revoke") {
      setStatus.mutate("revoked", { onSuccess: close });
    } else if (action === "block") {
      block.mutate({ address: peer.address, blocked: !conversation.blocked }, { onSuccess: close });
    } else if (action === "report") {
      const note = comment.trim();
      report.mutate(
        {
          reportedAddress: peer.address,
          ...(reported ? { messageId: reported.id } : {}),
          ...(note ? { comment: note } : {}),
        },
        {
          onSuccess: () => {
            toast.success(t`Report sent.`);
            close();
          },
        },
      );
    }
  }

  const failed = setStatus.isError || block.isError || report.isError;
  const pending = setStatus.isPending || block.isPending || report.isPending;
  const itemClass = "w-full justify-start";

  return (
    <>
      <PopoverRoot open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="icon" aria-label={t`Conversation options`} />}
        >
          <RiMore2Fill aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-48 gap-1 p-1">
          {actions.canRevoke ? (
            <Button variant="ghost" className={itemClass} onClick={() => choose("revoke")}>
              <Trans>Revoke</Trans>
            </Button>
          ) : null}
          {actions.canBlock ? (
            <Button variant="ghost" className={itemClass} onClick={() => choose("block")}>
              {conversation.blocked ? <Trans>Unblock</Trans> : <Trans>Block</Trans>}
            </Button>
          ) : null}
          {actions.canReport ? (
            <Button variant="ghost" className={itemClass} onClick={() => choose("report")}>
              <Trans>Report</Trans>
            </Button>
          ) : null}
        </PopoverContent>
      </PopoverRoot>
      <DialogRoot
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="grid gap-4 rounded-none border border-border bg-card shadow-none">
            <DialogTitle>
              {action === "revoke" ? (
                <Trans>Revoke this conversation?</Trans>
              ) : action === "block" ? (
                conversation.blocked ? (
                  <Trans>Unblock this person?</Trans>
                ) : (
                  <Trans>Block this person?</Trans>
                )
              ) : (
                <Trans>Report this person</Trans>
              )}
            </DialogTitle>
            {action === "revoke" ? (
              <p className="text-sm">
                <Trans>Neither of you can send messages. Only you can ask to talk again.</Trans>
              </p>
            ) : null}
            {action === "block" && !conversation.blocked ? (
              <p className="text-sm">
                <Trans>They won't be able to message you or send you requests.</Trans>
              </p>
            ) : null}
            {action === "report" ? (
              <Field label={t`What happened?`} htmlFor="desk-report-comment">
                <Textarea
                  id="desk-report-comment"
                  value={comment}
                  maxLength={ABUSE_REPORT_COMMENT_MAX}
                  placeholder={t`Optional`}
                  onChange={(event) => setComment(event.target.value)}
                />
              </Field>
            ) : null}
            {failed ? (
              <p role="alert" className="text-xs text-destructive">
                <Trans>That didn't work. Try again.</Trans>
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant={action === "report" ? "default" : "destructive"}
                className="flex-1"
                pending={pending}
                onClick={confirm}
              >
                {action === "revoke" ? (
                  <Trans>Revoke</Trans>
                ) : action === "block" ? (
                  conversation.blocked ? (
                    <Trans>Unblock</Trans>
                  ) : (
                    <Trans>Block</Trans>
                  )
                ) : (
                  <Trans>Send report</Trans>
                )}
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
