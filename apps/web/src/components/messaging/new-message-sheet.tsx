import {
  CONVERSATION_INTRO_MAX,
  type MessageContextInput,
  type MessageLaunchContext,
} from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiQuillPenLine } from "react-icons/ri";
import { ConversationLookupState } from "#/components/messaging/conversation-lookup-state";
import { PostRequestForm } from "#/components/messaging/post-request-form";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { useNewMessage } from "#/features/messaging/hooks/use-new-message";
import { ResourceContextCard } from "./resource-context-card";
import { VoucherProposalPicker } from "./voucher-proposal-picker";

/**
 * Finds a person through the recipient search and asks to message them. Only
 * `kind: "user"` results carry a Message action. Someone already in the list
 * opens their existing thread instead of a second request.
 */
export function NewMessageSheet({
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
  const { term, search, users, selected, intro, request, failure } = flow;
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
      <Button variant="outline" tap className="w-full" onClick={() => changeOpen(true)}>
        <RiQuillPenLine aria-hidden="true" />
        <Trans>New message</Trans>
      </Button>
      <SheetRoot open={open} onOpenChange={changeOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                <Trans>New message</Trans>
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
              {post ? (
                <PostRequestForm
                  key={post.resourceId}
                  postId={post.resourceId}
                  onOpenThread={openThread}
                />
              ) : flow.lookupStatus !== "idle" ? (
                <ConversationLookupState state={flow.lookupStatus} onRetry={flow.retryLookup} />
              ) : selected ? (
                <>
                  <div className="border border-border bg-card p-3">
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
                  <Field label={t`Introduce yourself`} htmlFor="new-message-intro">
                    <Textarea
                      id="new-message-intro"
                      value={intro}
                      maxLength={CONVERSATION_INTRO_MAX}
                      placeholder={t`Optional`}
                      onChange={(event) => flow.setIntro(event.target.value)}
                    />
                  </Field>
                  {failure ? (
                    <p role="alert" className="text-destructive text-xs">
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
                </>
              ) : (
                <>
                  {!directed ? (
                    <>
                      <label htmlFor="new-message-search" className="sr-only">
                        {t`Username, address, or phone number`}
                      </label>
                      <Input
                        id="new-message-search"
                        dir="ltr"
                        value={flow.query}
                        maxLength={120}
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={t`Username, address, or phone number`}
                        onChange={(event) => flow.setQuery(event.target.value)}
                      />
                    </>
                  ) : null}
                  {directed && flow.targetSearch.isPending ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>Loading recipients…</Trans>
                    </p>
                  ) : null}
                  {directed && flow.targetSearch.isError ? (
                    <div role="alert" className="space-y-2 text-xs">
                      <p className="text-destructive">
                        <Trans>Couldn't load recipients.</Trans>
                      </p>
                      <Button
                        variant="outline"
                        tap
                        pending={flow.targetSearch.isFetching}
                        onClick={() => void flow.targetSearch.refetch()}
                      >
                        <Trans>Retry</Trans>
                      </Button>
                    </div>
                  ) : null}
                  {directed && flow.targetSearch.isSuccess && shownUsers.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>No message recipient is available.</Trans>
                    </p>
                  ) : null}
                  {directed && shownUsers.length > 1 ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>Choose who to message.</Trans>
                    </p>
                  ) : null}
                  {!selected && failure === "self" ? (
                    <p role="alert" className="text-destructive text-xs">
                      <Trans>You can't message yourself.</Trans>
                    </p>
                  ) : null}
                  {!directed && term && (search.isDebouncing || search.isFetching) ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>Searching…</Trans>
                    </p>
                  ) : null}
                  {!directed && term && search.error ? (
                    <p role="alert" className="text-destructive text-xs">
                      <Trans>Couldn't search. Try again.</Trans>
                    </p>
                  ) : null}
                  {!directed &&
                  term &&
                  !search.isDebouncing &&
                  search.isSuccess &&
                  users.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>No matching people.</Trans>
                    </p>
                  ) : null}
                  {shownUsers.length > 0 ? (
                    <ul className="border border-border bg-card" aria-label={t`Matching people`}>
                      {shownUsers.map((match) => (
                        <li
                          key={match.address}
                          className="flex items-center gap-2 border-border border-b p-3 last:border-b-0"
                        >
                          <div className="min-w-0 flex-1">
                            <RecipientIdentityText
                              identity={match}
                              className="block truncate text-sm font-semibold"
                            />
                            <EllipsizedAddress address={match.address} className="block" />
                          </div>
                          <Button variant="outline" tap onClick={() => choose(match)}>
                            <Trans>Message</Trans>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
            {!post && selected && flow.lookupStatus === "idle" ? (
              <SheetFooter>
                <Button tap pending={request.isPending} onClick={flow.submit}>
                  <Trans>Send request</Trans>
                </Button>
                <Button
                  variant="outline"
                  tap
                  disabled={request.isPending}
                  onClick={changeRecipient}
                >
                  <Trans>Back</Trans>
                </Button>
              </SheetFooter>
            ) : null}
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
