import { BackendApiError } from "@clc/api/client/errors";
import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import { ownerInfoQueryOptions } from "@clc/api/features/safe/queries";
import type { Conversation } from "@clc/core/features/messaging/logic";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useRecipientSearch } from "#/features/wallet/hooks/use-recipient-resolution";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { useRequestConversation } from "./use-conversation-actions";

type NewMessageFailure = "missing" | "exists" | "quota" | "self" | "failed";

/**
 * Finding a person through the recipient search and asking to message them,
 * for the phone sheet and the desktop dialog. Only `kind: "user"` results on
 * this chain can be messaged. Someone already in `existing` opens their thread
 * instead of a second request.
 */
export function useNewMessage(
  existing: readonly Conversation[],
  openThread: (conversationId: number) => void,
  ownerAddress?: `0x${string}`,
) {
  const auth = useAuthStatus();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RecipientIdentity | null>(null);
  const [intro, setIntro] = useState("");
  const [localFailure, setLocalFailure] = useState<NewMessageFailure | null>(null);
  const term = query.trim();
  const search = useRecipientSearch(term === "" ? null : term, false);
  const ownerSearch = useQuery({
    ...ownerInfoQueryOptions(safeClient, ownerAddress),
    retry: false,
  });
  const request = useRequestConversation();
  const users = (search.data ?? []).filter(
    (match) => match.kind === "user" && (match.chainId === CHAIN_ID || match.chainId === 0),
  );
  const viewer = auth.isAuthenticated ? auth.session?.address.toLowerCase() : undefined;
  const ownerUsers: RecipientIdentity[] = (ownerSearch.data?.messageTargets ?? [])
    .filter((target) => target.address.toLowerCase() !== viewer)
    .map((target) => ({
      kind: "user",
      name: target.username ?? target.address,
      alias: target.username ?? target.address,
      address: target.address,
      chainId: CHAIN_ID,
    }));

  const failure: NewMessageFailure | null =
    localFailure ??
    (request.error instanceof BackendApiError
      ? request.error.status === 404
        ? "missing"
        : request.error.status === 409
          ? "exists"
          : request.error.status === 429
            ? "quota"
            : "failed"
      : request.error
        ? "failed"
        : null);

  function choose(match: RecipientIdentity) {
    setLocalFailure(null);
    if (match.address.toLowerCase() === viewer) {
      setLocalFailure("self");
      return;
    }
    const known = existing.find(
      (conversation) => conversation.peer?.address.toLowerCase() === match.address.toLowerCase(),
    );
    if (known) openThread(known.id);
    else setSelected(match);
  }

  return {
    query,
    setQuery,
    term,
    search,
    users,
    ownerSearch,
    ownerUsers,
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
      setLocalFailure(null);
      request.reset();
    },
    choose,
    unselect: () => {
      setSelected(null);
      setLocalFailure(null);
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
