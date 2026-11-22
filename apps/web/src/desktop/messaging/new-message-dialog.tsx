import {
  CONVERSATION_INTRO_MAX,
  type MessageContextInput,
  type MessageLaunchContext,
} from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiQuillPenLine, RiSearchLine } from "react-icons/ri";
import { ConversationLookupState } from "#/components/messaging/conversation-lookup-state";
import { PostRequestForm } from "#/components/messaging/post-request-form";

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
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { useNewMessage } from "#/features/messaging/hooks/use-new-message";
import { ResourceContextCard } from "#/components/messaging/resource-context-card";
import { VoucherProposalPicker } from "#/components/messaging/voucher-proposal-picker";

/**
 * New message on the desktop: the recipient search in a dialog, then an
 * optional introduction. An existing conversation opens in the inbox.
 */
export function NewMessageDialog({
  messageTo,
  messageContext,
  onMessageToConsumed,
}: {
  messageTo?: `0x${string}`;
  messageContext?: MessageLaunchContext;
  onMessageToConsumed?: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const post = messageContext?.kind === "post" ? messageContext : undefined;
  const context = messageContext?.kind === "post" ? undefined : messageContext;
  const directed = Boolean(messageTo || context);
  const launchKey = messageContext
    ? `${messageContext.kind}:${messageContext.resourceId}:${messageTo ?? ""}`
    : messageTo;
  function openThread(conversationId: number, threadContext?: MessageContextInput) {
    changeOpen(false);
    void navigate({
      to: "/messages/$conversationId",
      params: { conversationId: String(conversationId) },
      search: threadContext
        ? {
            messageKind: threadContext.kind,
            messageResource: threadContext.resourceId,
            messageVoucher:
              threadContext.kind === "pool" ? threadContext.proposedVoucherAddress : undefined,
          }
        : {},
    });
  }
  const flow = useNewMessage(openThread, post ? undefined : messageTo, context);
  const { term, search, users, selected, failure } = flow;
  const shownUsers = directed ? flow.ownerUsers : users;

  useEffect(() => {
    if (launchKey) setOpen(true);
  }, [launchKey]);

  useEffect(() => {
    if (
      !open ||
      post ||
      !directed ||
      !flow.targetSearch.isSuccess ||
      flow.ownerUsers.length !== 1 ||
      selected ||
      flow.lookupStatus !== "idle"
    ) {
      return;
    }
    flow.choose(flow.ownerUsers[0]!, context);
  }, [context, directed, flow, open, post, selected]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      if (launchKey) onMessageToConsumed?.();
      flow.reset();
    }
  }

  function choose(match: (typeof shownUsers)[number]) {
    flow.choose(match, context);
  }

  function changeRecipient() {
    if (directed && shownUsers.length === 1) changeOpen(false);
    else flow.unselect();
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => changeOpen(true)}>
        <RiQuillPenLine aria-hidden="true" />
        <Trans>New message</Trans>
      </Button>
      <DialogRoot open={open} onOpenChange={changeOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="flex min-h-0 max-h-[min(640px,calc(100dvh-4rem))] max-w-[480px] flex-col gap-4 rounded-none border border-border bg-card shadow-none">
            <DialogTitle className="shrink-0">
              <Trans>New message</Trans>
            </DialogTitle>
            {post ? (
              <PostRequestForm
                key={post.resourceId}
                postId={post.resourceId}
                onOpenThread={openThread}
              />
            ) : flow.lookupStatus !== "idle" ? (
              <ConversationLookupState state={flow.lookupStatus} onRetry={flow.retryLookup} />
            ) : selected ? (
              <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
                <div className="border border-border bg-background p-3">
                  <RecipientIdentityText
                    identity={selected}
                    className="block text-sm font-semibold"
                  />
                  <EllipsizedAddress address={selected.address} className="mt-1 block" />
                </div>
                {flow.context ? <ResourceContextCard context={flow.context} /> : null}
                {flow.context?.kind === "pool" ? (
                  <VoucherProposalPicker
                    key={flow.context.resourceId}
                    poolAddress={flow.context.resourceId}
                    value={flow.context.proposedVoucherAddress}
                    onChange={flow.setProposedVoucher}
                  />
                ) : null}
                <Field label={t`Introduce yourself`} htmlFor="desk-new-message-intro">
                  <Textarea
                    id="desk-new-message-intro"
                    value={flow.intro}
                    maxLength={CONVERSATION_INTRO_MAX}
                    placeholder={t`Optional`}
                    onChange={(event) => flow.setIntro(event.target.value)}
                  />
                </Field>
                {failure ? (
                  <p role="alert" className="text-xs text-destructive">
                    {failure === "self" ? (
                      <Trans>You can't message yourself.</Trans>
                    ) : failure === "missing" ? (
                      <Trans>You can't message this person.</Trans>
                    ) : failure === "exists" ? (
                      <Trans>You already have a conversation with this person.</Trans>
                    ) : failure === "quota" ? (
                      <Trans>You've sent too many requests today. Try again tomorrow.</Trans>
                    ) : (
                      <Trans>Couldn't send the request. Try again.</Trans>
                    )}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                {!directed ? (
                  <div className="relative">
                    <RiSearchLine
                      className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      dir="ltr"
                      type="search"
                      value={flow.query}
                      maxLength={120}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t`Username, address, or phone number`}
                      placeholder={t`Username, address, or phone number`}
                      className="ps-8"
                      onChange={(event) => flow.setQuery(event.target.value)}
                    />
                  </div>
                ) : null}
                <div className="min-h-0 overflow-y-auto">
                  {directed && flow.targetSearch.isPending ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner />
                      <Trans>Loading recipients…</Trans>
                    </p>
                  ) : null}
                  {directed && flow.targetSearch.isError ? (
                    <div role="alert" className="grid justify-items-start gap-2 text-xs">
                      <p className="text-destructive">
                        <Trans>Couldn't load recipients.</Trans>
                      </p>
                      <Button
                        variant="outline"
                        pending={flow.targetSearch.isFetching}
                        onClick={() => void flow.targetSearch.refetch()}
                      >
                        <Trans>Retry</Trans>
                      </Button>
                    </div>
                  ) : null}
                  {directed &&
                  flow.targetSearch.isSuccess &&
                  shownUsers.length === 0 &&
                  failure !== "self" ? (
                    <p className="text-xs text-muted-foreground">
                      <Trans>No message recipient is available.</Trans>
                    </p>
                  ) : null}
                  {directed && shownUsers.length > 1 ? (
                    <p className="text-xs text-muted-foreground">
                      <Trans>Choose who to message.</Trans>
                    </p>
                  ) : null}
                  {!selected && failure === "self" ? (
                    <p role="alert" className="text-xs text-destructive">
                      <Trans>You can't message yourself.</Trans>
                    </p>
                  ) : null}
                  {!directed && term && (search.isDebouncing || search.isFetching) ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner />
                      <Trans>Searching…</Trans>
                    </p>
                  ) : null}
                  {!directed && term && search.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      <Trans>Couldn't search. Try again.</Trans>
                    </p>
                  ) : null}
                  {!directed &&
                  term &&
                  !search.isDebouncing &&
                  search.isSuccess &&
                  users.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      <Trans>No matching people.</Trans>
                    </p>
                  ) : null}
                  {shownUsers.length > 0 ? (
                    <ul
                      className="border border-border [&>li+li]:border-border [&>li+li]:border-t"
                      aria-label={t`Matching people`}
                    >
                      {shownUsers.map((match) => (
                        <li key={match.address} className="flex items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <RecipientIdentityText
                              identity={match}
                              className="block truncate text-sm font-semibold"
                            />
                            <EllipsizedAddress address={match.address} className="block" />
                          </div>
                          <Button variant="outline" onClick={() => choose(match)}>
                            <Trans>Message</Trans>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            )}
            {!post && selected && flow.lookupStatus === "idle" ? (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={flow.request.isPending}
                  onClick={changeRecipient}
                >
                  <Trans>Back</Trans>
                </Button>
                <Button className="flex-1" pending={flow.request.isPending} onClick={flow.submit}>
                  <Trans>Send request</Trans>
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
