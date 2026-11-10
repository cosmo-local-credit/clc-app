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
import { Field } from "#/components/ui/field";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import {
  useBlockPeer,
  useReportPeer,
  useSetConversationStatus,
} from "../hooks/use-conversation-actions";

type Step = "menu" | "revoke" | "block" | "report";

/** Revoke, Block and Report for a direct conversation, each confirmed in the sheet. */
export function ThreadMenuSheet({
  conversation,
  messages,
}: {
  conversation: Conversation;
  messages: readonly Message[];
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [comment, setComment] = useState("");
  const actions = conversationActions(conversation);
  const setStatus = useSetConversationStatus(conversation.id);
  const block = useBlockPeer(conversation.id);
  const report = useReportPeer();
  const peer = conversation.peer;
  // A report carries the newest message the peer sent, when there is one.
  const reported = [...messages].reverse().find((message) => message.sender === "peer");

  if (!peer || (!actions.canRevoke && !actions.canBlock && !actions.canReport)) return null;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep("menu");
      setComment("");
      setStatus.reset();
      block.reset();
      report.reset();
    }
  }

  const failed = setStatus.isError || block.isError || report.isError;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        tap
        aria-label={t`Conversation options`}
        onClick={() => changeOpen(true)}
      >
        <RiMore2Fill aria-hidden="true" />
      </Button>
      <SheetRoot open={open} onOpenChange={changeOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {step === "revoke" ? (
                  <Trans>Revoke this conversation?</Trans>
                ) : step === "block" ? (
                  conversation.blocked ? (
                    <Trans>Unblock this person?</Trans>
                  ) : (
                    <Trans>Block this person?</Trans>
                  )
                ) : step === "report" ? (
                  <Trans>Report this person</Trans>
                ) : (
                  <Trans>Conversation options</Trans>
                )}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-3 px-4 pb-2">
              {step === "revoke" ? (
                <p className="text-sm">
                  <Trans>Neither of you can send messages. Only you can ask to talk again.</Trans>
                </p>
              ) : null}
              {step === "block" && !conversation.blocked ? (
                <p className="text-sm">
                  <Trans>They won't be able to message you or send you requests.</Trans>
                </p>
              ) : null}
              {step === "report" ? (
                <Field label={t`What happened?`} htmlFor="report-comment">
                  <Textarea
                    id="report-comment"
                    value={comment}
                    maxLength={ABUSE_REPORT_COMMENT_MAX}
                    placeholder={t`Optional`}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </Field>
              ) : null}
              {failed ? (
                <p role="alert" className="text-destructive text-xs">
                  <Trans>That didn't work. Try again.</Trans>
                </p>
              ) : null}
            </div>
            <SheetFooter>
              {step === "menu" ? (
                <>
                  {actions.canRevoke ? (
                    <Button variant="outline" tap onClick={() => setStep("revoke")}>
                      <Trans>Revoke</Trans>
                    </Button>
                  ) : null}
                  {actions.canBlock ? (
                    <Button variant="outline" tap onClick={() => setStep("block")}>
                      {conversation.blocked ? <Trans>Unblock</Trans> : <Trans>Block</Trans>}
                    </Button>
                  ) : null}
                  {actions.canReport ? (
                    <Button variant="outline" tap onClick={() => setStep("report")}>
                      <Trans>Report</Trans>
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button
                    variant={step === "report" ? "default" : "destructive"}
                    tap
                    pending={setStatus.isPending || block.isPending || report.isPending}
                    onClick={() => {
                      if (step === "revoke") {
                        setStatus.mutate("revoked", { onSuccess: () => changeOpen(false) });
                      } else if (step === "block") {
                        block.mutate(
                          { address: peer.address, blocked: !conversation.blocked },
                          { onSuccess: () => changeOpen(false) },
                        );
                      } else {
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
                              changeOpen(false);
                            },
                          },
                        );
                      }
                    }}
                  >
                    {step === "revoke" ? (
                      <Trans>Revoke</Trans>
                    ) : step === "block" ? (
                      conversation.blocked ? (
                        <Trans>Unblock</Trans>
                      ) : (
                        <Trans>Block</Trans>
                      )
                    ) : (
                      <Trans>Send report</Trans>
                    )}
                  </Button>
                  <Button variant="outline" tap onClick={() => setStep("menu")}>
                    <Trans>Cancel</Trans>
                  </Button>
                </>
              )}
            </SheetFooter>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
