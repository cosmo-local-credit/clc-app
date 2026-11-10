import { CONVERSATION_INTRO_MAX, type Conversation } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiQuillPenLine, RiSearchLine } from "react-icons/ri";

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

/**
 * New message on the desktop: the recipient search in a dialog, then an
 * optional introduction. Someone already in the list opens their thread.
 */
export function NewMessageDialog({ existing }: { existing: readonly Conversation[] }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const flow = useNewMessage(existing, (conversationId) => {
    changeOpen(false);
    void navigate({
      to: "/messages/$conversationId",
      params: { conversationId: String(conversationId) },
    });
  });
  const { term, search, users, selected, failure } = flow;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) flow.reset();
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
          <DialogContent className="flex max-h-[min(640px,calc(100dvh-4rem))] max-w-[480px] flex-col gap-4 rounded-none border border-border bg-card shadow-none">
            <DialogTitle>
              <Trans>New message</Trans>
            </DialogTitle>
            {selected ? (
              <>
                <div className="border border-border bg-background p-3">
                  <RecipientIdentityText
                    identity={selected}
                    className="block text-sm font-semibold"
                  />
                  <EllipsizedAddress address={selected.address} className="mt-1 block" />
                </div>
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
                    {failure === "missing" ? (
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
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={flow.unselect}>
                    <Trans>Back</Trans>
                  </Button>
                  <Button className="flex-1" pending={flow.request.isPending} onClick={flow.submit}>
                    <Trans>Send request</Trans>
                  </Button>
                </div>
              </>
            ) : (
              <>
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
                    aria-label={t`Username or phone number`}
                    placeholder={t`Username or phone number`}
                    className="ps-8"
                    onChange={(event) => flow.setQuery(event.target.value)}
                  />
                </div>
                <div className="min-h-0 overflow-y-auto">
                  {term && (search.isDebouncing || search.isFetching) ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner />
                      <Trans>Searching…</Trans>
                    </p>
                  ) : null}
                  {term && search.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      <Trans>Couldn't search. Try again.</Trans>
                    </p>
                  ) : null}
                  {term && !search.isDebouncing && search.isSuccess && users.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      <Trans>No matching people.</Trans>
                    </p>
                  ) : null}
                  {users.length > 0 ? (
                    <ul
                      className="border border-border [&>li+li]:border-border [&>li+li]:border-t"
                      aria-label={t`Matching people`}
                    >
                      {users.map((match) => (
                        <li key={match.address} className="flex items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <RecipientIdentityText
                              identity={match}
                              className="block truncate text-sm font-semibold"
                            />
                            <EllipsizedAddress address={match.address} className="block" />
                          </div>
                          <Button variant="outline" onClick={() => flow.choose(match)}>
                            <Trans>Message</Trans>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            )}
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
