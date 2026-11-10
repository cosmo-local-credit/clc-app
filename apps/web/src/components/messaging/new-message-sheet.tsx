import { CONVERSATION_INTRO_MAX, type Conversation } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiQuillPenLine } from "react-icons/ri";

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

/**
 * Finds a person through the recipient search and asks to message them. Only
 * `kind: "user"` results carry a Message action. Someone already in the list
 * opens their existing thread instead of a second request.
 */
export function NewMessageSheet({ existing }: { existing: readonly Conversation[] }) {
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
  const { term, search, users, selected, intro, request, failure } = flow;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) flow.reset();
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
              {selected ? (
                <>
                  <div className="border border-border bg-card p-3">
                    <RecipientIdentityText
                      identity={selected}
                      className="block text-sm font-semibold"
                    />
                    <EllipsizedAddress address={selected.address} className="mt-1 block" />
                  </div>
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
                </>
              ) : (
                <>
                  <label htmlFor="new-message-search" className="sr-only">
                    {t`Username or phone number`}
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
                    placeholder={t`Username or phone number`}
                    onChange={(event) => flow.setQuery(event.target.value)}
                  />
                  {term && (search.isDebouncing || search.isFetching) ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>Searching…</Trans>
                    </p>
                  ) : null}
                  {term && search.error ? (
                    <p role="alert" className="text-destructive text-xs">
                      <Trans>Couldn't search. Try again.</Trans>
                    </p>
                  ) : null}
                  {term && !search.isDebouncing && search.isSuccess && users.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>No matching people.</Trans>
                    </p>
                  ) : null}
                  {users.length > 0 ? (
                    <ul className="border border-border bg-card" aria-label={t`Matching people`}>
                      {users.map((match) => (
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
                          <Button variant="outline" tap onClick={() => flow.choose(match)}>
                            <Trans>Message</Trans>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
            {selected ? (
              <SheetFooter>
                <Button tap pending={request.isPending} onClick={flow.submit}>
                  <Trans>Send request</Trans>
                </Button>
                <Button variant="outline" tap onClick={flow.unselect}>
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
