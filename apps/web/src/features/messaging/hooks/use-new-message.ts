import { BackendApiError } from "@clc/api/client/errors";
import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import type { Conversation } from "@clc/core/features/messaging/logic";
import { useState } from "react";

import { useRecipientSearch } from "#/features/wallet/hooks/use-recipient-resolution";
import { CHAIN_ID } from "#/lib/chain";
import { useRequestConversation } from "./use-conversation-actions";

export type NewMessageFailure = "missing" | "exists" | "quota" | "failed";

/**
 * Finding a person through the recipient search and asking to message them,
 * for the phone sheet and the desktop dialog. Only `kind: "user"` results on
 * this chain can be messaged. Someone already in `existing` opens their thread
 * instead of a second request.
 */
export function useNewMessage(
  existing: readonly Conversation[],
  openThread: (conversationId: number) => void,
) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RecipientIdentity | null>(null);
  const [intro, setIntro] = useState("");
  const term = query.trim();
  const search = useRecipientSearch(term === "" ? null : term, false);
  const request = useRequestConversation();
  const users = (search.data ?? []).filter(
    (match) => match.kind === "user" && (match.chainId === CHAIN_ID || match.chainId === 0),
  );

  const failure: NewMessageFailure | null =
    request.error instanceof BackendApiError
      ? request.error.status === 404
        ? "missing"
        : request.error.status === 409
          ? "exists"
          : request.error.status === 429
            ? "quota"
            : "failed"
      : request.error
        ? "failed"
        : null;

  return {
    query,
    setQuery,
    term,
    search,
    users,
    selected,
    intro,
    setIntro,
    request,
    failure,
    /** Clears the search, the choice and any failure. */
    reset: () => {
      setQuery("");
      setSelected(null);
      setIntro("");
      request.reset();
    },
    choose: (match: RecipientIdentity) => {
      const known = existing.find((conversation) => conversation.peer?.address === match.address);
      if (known) openThread(known.id);
      else setSelected(match);
    },
    unselect: () => {
      setSelected(null);
    },
    submit: () => {
      if (!selected) return;
      const note = intro.trim();
      request.mutate(
        { recipientAddress: selected.address, ...(note ? { intro: note } : {}) },
        { onSuccess: (conversation) => openThread(conversation.id) },
      );
    },
  };
}
