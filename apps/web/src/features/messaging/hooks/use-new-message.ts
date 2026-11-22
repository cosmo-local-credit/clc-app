import { BackendApiError } from "@clc/api/client/errors";
import {
  conversationByPeerQueryOptions,
  messagingKeys,
  resourceTargetsQueryOptions,
} from "@clc/api/features/messaging/queries";
import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import { ownerInfoQueryOptions } from "@clc/api/features/safe/queries";
import type { MessageContextInput } from "@clc/core/features/messaging/logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRecipientSearch } from "#/features/wallet/hooks/use-recipient-resolution";
import { messagingClient } from "#/lib/api/messaging";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { useRequestConversation } from "./use-conversation-actions";
import { useMessagingViewer } from "./use-messaging-viewer";

type NewMessageFailure = "missing" | "exists" | "quota" | "self" | "failed";

type PeerLookup = {
  viewer: string;
  recipient: RecipientIdentity;
  context?: MessageContextInput;
};

/**
 * Finding a person through the recipient search and asking to message them,
 * for the phone sheet and the desktop dialog. Only `kind: "user"` results on
 * this chain can be messaged. Resolve the exact peer independently of the
 * inbox so an older conversation opens without sending a second request.
 */
export function useNewMessage(
  openThread: (conversationId: number, context?: MessageContextInput) => void,
  ownerAddress?: `0x${string}`,
  initialContext?: MessageContextInput,
) {
  const viewer = useMessagingViewer()?.toLowerCase();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<{
    attempt: PeerLookup;
    status: "pending" | "error" | "new-request";
  } | null>(null);
  const [intro, setIntro] = useState("");
  const [localFailure, setLocalFailure] = useState<NewMessageFailure | null>(null);
  const [context, setContext] = useState<MessageContextInput | undefined>(initialContext);
  const currentLookup = useRef<PeerLookup | null>(null);
  const stopLookup = useCallback(() => {
    const attempt = currentLookup.current;
    currentLookup.current = null;
    if (attempt) {
      void queryClient.cancelQueries({
        queryKey: messagingKeys.peer(attempt.viewer, attempt.recipient.address),
        exact: true,
      });
    }
  }, [queryClient]);
  useEffect(() => stopLookup, [stopLookup, viewer]);

  const viewerLookup = lookup?.attempt.viewer === viewer ? lookup : null;
  const selected = viewerLookup?.status === "new-request" ? viewerLookup.attempt.recipient : null;
  const lookupStatus: "idle" | "pending" | "error" =
    viewerLookup && viewerLookup.status !== "new-request" ? viewerLookup.status : "idle";
  const term = query.trim();
  const search = useRecipientSearch(term === "" ? null : term, false);
  const ownerSearch = useQuery({
    ...ownerInfoQueryOptions(safeClient, ownerAddress),
    retry: false,
  });
  const resourceSearch = useQuery(
    resourceTargetsQueryOptions(messagingClient, viewer, ownerAddress ? undefined : initialContext),
  );
  const targetSearch = ownerAddress ? ownerSearch : resourceSearch;
  const request = useRequestConversation();
  const users = (search.data ?? []).filter(
    (match) => match.kind === "user" && (match.chainId === CHAIN_ID || match.chainId === 0),
  );
  const targets = ownerAddress ? ownerSearch.data?.messageTargets : resourceSearch.data?.targets;
  const ownerUsers: RecipientIdentity[] = (targets ?? [])
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

  async function resolve(attempt: PeerLookup) {
    stopLookup();
    currentLookup.current = attempt;
    setLookup({ attempt, status: "pending" });
    try {
      const known = await queryClient.fetchQuery(
        conversationByPeerQueryOptions(messagingClient, attempt.viewer, attempt.recipient.address),
      );
      if (currentLookup.current !== attempt) return;
      if (known) {
        setLookup(null);
        openThread(
          known.id,
          known.status === "accepted" && !known.blocked ? attempt.context : undefined,
        );
      } else {
        setContext(attempt.context);
        setLookup({ attempt, status: "new-request" });
      }
    } catch {
      if (currentLookup.current === attempt) setLookup({ attempt, status: "error" });
    }
  }

  function choose(match: RecipientIdentity, contextOverride?: MessageContextInput) {
    if (!viewer) return;
    setLocalFailure(null);
    if (match.address.toLowerCase() === viewer) {
      stopLookup();
      setLookup(null);
      setLocalFailure("self");
      return;
    }
    request.reset();
    void resolve({ viewer, recipient: match, context: contextOverride });
  }

  return {
    query,
    setQuery,
    term,
    search,
    users,
    targetSearch,
    ownerUsers,
    selected,
    intro,
    setIntro,
    request,
    failure,
    lookupStatus,
    retryLookup: () => {
      if (viewerLookup?.status === "error") void resolve({ ...viewerLookup.attempt });
    },
    /** Clears the search, the choice and any failure. */
    reset: () => {
      stopLookup();
      setLookup(null);
      setQuery("");
      setIntro("");
      setLocalFailure(null);
      request.reset();
      setContext(initialContext);
    },
    choose,
    unselect: () => {
      stopLookup();
      setLookup(null);
      setLocalFailure(null);
      request.reset();
    },
    submit: () => {
      if (!selected || request.isPending || lookupStatus !== "idle") return;
      const attempt = currentLookup.current;
      if (!attempt || attempt.viewer !== viewer) return;
      const note = intro.trim();
      request.mutate(
        {
          recipientAddress: selected.address,
          ...(note ? { intro: note } : {}),
          ...(context ? { context } : {}),
        },
        {
          onSuccess: (conversation) => {
            if (currentLookup.current === attempt) openThread(conversation.id);
          },
          onError: (error) => {
            if (
              currentLookup.current === attempt &&
              error instanceof BackendApiError &&
              error.status === 409
            ) {
              void resolve({ ...attempt, context });
            }
          },
        },
      );
    },
    context,
    setProposedVoucher: (address?: `0x${string}`) => {
      if (context?.kind !== "pool") return;
      setContext({
        kind: "pool",
        resourceId: context.resourceId,
        ...(address ? { proposedVoucherAddress: address } : {}),
      });
    },
  };
}
