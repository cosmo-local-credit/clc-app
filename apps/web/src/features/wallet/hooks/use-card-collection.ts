import { createRelayerClient } from "@clc/api/features/relayer/client";
import { relayerHealthQueryOptions } from "@clc/api/features/relayer/queries";
import {
  armCollectIntent,
  beginCollectUnlock,
  cancelCollectUnlock,
  claimCollectIntent,
  type CollectIntent,
  type CollectSession,
  type CollectToken,
  completeCollectUnlock,
  disarmCollectIntent,
  finishCollectCustomer,
  recordCollectRejected,
  recordCollectSubmitted,
  recordCollectUncertain,
  recordCollectUnknown,
  resolveCollectPayment,
} from "@clc/core/features/nfc/collect";
import { readNfcCardContent } from "@clc/core/features/nfc/logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { isEip7702Delegated } from "@clc/core/features/webauthn";
import { erc20Abi } from "viem";
import { getCode, readContract } from "viem/actions";
import { privateKeyToAccount } from "viem/accounts";
import { useClient } from "wagmi";

import type { NfcCardProblem } from "#/components/nfc-card-prompt";
import {
  prepareCollectPayment,
  reconcileCollectRequest,
  submitCollectRequest,
} from "#/features/wallet/api/collect-payment";
import { useCollectPayerKey } from "#/features/wallet/state/collect-payer-key";
import { useCollectSession } from "#/features/wallet/state/collect-session";
import { useCollectSubmissions } from "#/features/wallet/state/collect-submissions";
import { CHAIN_ID } from "#/lib/chain";
import { markNfc } from "#/lib/nfc/metrics";
import type { NdefReaderConstructor } from "#/lib/nfc/ndef-adapter";
import { useNfcScan } from "#/lib/nfc/use-nfc-scan";
import { CALIBUR_ADDRESS, RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

/** Why a presented card did not start a payment. Nothing was charged in any of these. */
export type CollectNotice =
  | { kind: "card"; problem: NfcCardProblem }
  | { kind: "not-armed" }
  | { kind: "wrong-source" }
  | { kind: "latched" }
  | { kind: "payer-unresolved" }
  | { kind: "self-payment" };

export type CollectDraft = {
  token: CollectToken;
  amountRaw: string;
  amountLabel: string;
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function applySession(transition: (session: CollectSession) => CollectSession) {
  useCollectSession.getState().apply(transition);
}

/**
 * Card collection for the signed-in collector.
 *
 * The collector's own identity is never touched: the payer's key is held in
 * `useCollectPayerKey` as a transient signer and nothing here stores it,
 * connects wagmi with it, or signs in with it. Every charge consumes one armed
 * intent; the scan stays open between intents while the page is visible, and
 * hiding the page disarms whatever was waiting.
 */
export function useCardCollection({
  collector,
  Reader,
}: {
  collector: `0x${string}` | undefined;
  Reader?: NdefReaderConstructor | null;
}) {
  const queryClient = useQueryClient();
  const chainClient = useClient({ chainId: CHAIN_ID });
  const health = useQuery(relayerHealthQueryOptions(relayerClient));
  const session = useCollectSession((state) => state.session);
  const heldPayer = useCollectPayerKey((state) => state.payer);
  const submissions = useCollectSubmissions((state) => state.submissions);
  const [notice, setNotice] = useState<CollectNotice | null>(null);
  const [unlock, setUnlock] = useState<{ intentId: string; encryptedKey: string } | null>(null);
  const reconciling = useRef(new Map<string, AbortController>());

  const reconcile = useCallback((operationId: string) => {
    if (reconciling.current.has(operationId)) return;
    const entry = useCollectSubmissions
      .getState()
      .submissions.find((submission) => submission.operationId === operationId);
    if (!entry?.request || entry.trackingId) return;
    const controller = new AbortController();
    reconciling.current.set(operationId, controller);
    void reconcileCollectRequest(entry.request, entry.expiresAt, {
      relayer: relayerClient,
      now: Date.now,
      sleep,
      signal: controller.signal,
    }).then((result) => {
      if (reconciling.current.get(operationId) === controller)
        reconciling.current.delete(operationId);
      const { update } = useCollectSubmissions.getState();
      switch (result.kind) {
        case "submitted":
          markNfc(operationId, "relay-submitted");
          update(operationId, { trackingId: result.trackingId });
          applySession((current) =>
            recordCollectSubmitted(current, operationId, result.trackingId),
          );
          return;
        case "rejected":
          update(operationId, { status: "failed" });
          applySession((current) =>
            resolveCollectPayment(
              recordCollectRejected(current, operationId, "relay-rejected", result.detail),
              operationId,
            ),
          );
          return;
        case "unknown":
          update(operationId, { status: "unknown" });
          applySession((current) => recordCollectUnknown(current, operationId));
          return;
        case "aborted":
          return;
      }
    });
  }, []);

  const runPayment = useCallback(
    async (intent: CollectIntent, payer: `0x${string}`) => {
      const fail = (detail: string) =>
        applySession((current) => recordCollectRejected(current, intent.id, "failed", detail));
      const key = useCollectPayerKey.getState().key;
      if (!key || privateKeyToAccount(key).address.toLowerCase() !== payer.toLowerCase()) {
        fail("The card's key is no longer held. Present the card again.");
        return;
      }
      if (!chainClient) {
        fail("No RPC client is configured for this chain.");
        return;
      }
      try {
        const relayerHealth = await queryClient.fetchQuery(
          relayerHealthQueryOptions(relayerClient),
        );
        if (!relayerHealth.idempotentRelay) {
          fail("This server cannot yet confirm a card payment safely.");
          return;
        }
        markNfc(intent.id, "relay-preview");
        const prepared = await prepareCollectPayment(intent, key, {
          relayer: relayerClient,
          health: relayerHealth,
          chainId: CHAIN_ID,
          // Both read for the payer's explicit address: the connected wallet's
          // hooks would answer for the collector.
          readBalance: (token, owner) =>
            readContract(chainClient, {
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [owner],
            }),
          readDelegated: async (address) =>
            isEip7702Delegated(await getCode(chainClient, { address }), CALIBUR_ADDRESS),
          now: Date.now,
        });
        if (prepared.kind === "rejected") {
          applySession((current) =>
            recordCollectRejected(current, intent.id, prepared.reason, prepared.detail),
          );
          return;
        }
        markNfc(intent.id, "relay-signed");
        // Recorded before sending, so a reload mid-request can still find it.
        useCollectSubmissions.getState().add({
          operationId: intent.id,
          collector: intent.collector,
          payer,
          token: intent.token,
          amountLabel: intent.amountLabel,
          createdAt: Date.now(),
          expiresAt: prepared.expiresAt,
          trackingId: null,
          request: prepared.request,
          status: "pending",
        });
        const result = await submitCollectRequest(prepared.request, relayerClient);
        const { update } = useCollectSubmissions.getState();
        if (result.kind === "submitted") {
          markNfc(intent.id, "relay-submitted");
          update(intent.id, { trackingId: result.trackingId });
          applySession((current) => recordCollectSubmitted(current, intent.id, result.trackingId));
        } else if (result.kind === "uncertain") {
          applySession((current) => recordCollectUncertain(current, intent.id));
          reconcile(intent.id);
        } else {
          update(intent.id, { status: "failed" });
          applySession((current) =>
            recordCollectRejected(current, intent.id, "relay-rejected", result.detail),
          );
        }
      } catch (error) {
        // Everything that can throw runs before submission: nothing was sent.
        fail(error instanceof Error ? error.message : String(error));
      }
    },
    [chainClient, queryClient, reconcile],
  );

  const scan = useNfcScan({
    Reader,
    onTag: (reading) => {
      setNotice(null);
      const { session: current } = useCollectSession.getState();
      const operationId = current.state.phase === "armed" ? current.state.intent.id : "unarmed";
      markNfc(operationId, "event");
      const content = readNfcCardContent(reading);
      if (content.kind !== "credential") {
        setNotice({ kind: "card", problem: content.kind });
        return "continue";
      }
      markNfc(operationId, "decoded");

      if (content.credential.type === "encrypted") {
        const begun = beginCollectUnlock(current);
        if (!begun.ok) {
          setNotice({ kind: begun.reason });
          return "continue";
        }
        applySession(() => begun.session);
        setUnlock({ intentId: begun.intent.id, encryptedKey: content.credential.encryptedKey });
        return "continue";
      }

      const { key } = content.credential;
      const payer = privateKeyToAccount(key).address;
      const claim = claimCollectIntent(current, payer, "card");
      if (!claim.ok) {
        // The card that just paid, presented again: hold its key so the
        // collector can deliberately charge it, which is the only release.
        if (claim.reason === "latched") useCollectPayerKey.getState().retain(key);
        setNotice({ kind: claim.reason });
        return "continue";
      }
      applySession(() => claim.session);
      useCollectPayerKey.getState().retain(key);
      void runPayment(claim.intent, payer);
      return "continue";
    },
  });

  // Leaving the route ends the collection session: the held key goes, and so
  // does the in-memory latch. Unresolved payments survive in the submission
  // store and are picked up again on the way back in.
  useEffect(() => {
    if (!collector) return;
    const controllers = reconciling.current;
    void Promise.resolve(useCollectSubmissions.persist.rehydrate()).then(() => {
      const store = useCollectSubmissions.getState();
      store.expire(Date.now());
      const mine = useCollectSubmissions
        .getState()
        .submissions.filter(
          (entry) =>
            entry.status === "pending" && entry.collector.toLowerCase() === collector.toLowerCase(),
        );
      applySession((current) => ({
        ...current,
        unresolved: {
          ...current.unresolved,
          ...Object.fromEntries(
            mine.map((entry) => [entry.payer.toLowerCase(), entry.operationId]),
          ),
        },
      }));
      for (const entry of mine) if (!entry.trackingId) reconcile(entry.operationId);
    });
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      useCollectSession.getState().reset();
      useCollectPayerKey.getState().clear();
    };
  }, [collector, reconcile]);

  // Returning to the page must never find a card still beside the phone
  // charged against an intent armed before it was hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") applySession(disarmCollectIntent);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const scanActive =
    scan.phase === "starting" || scan.phase === "ready" || scan.phase === "handling";

  /** "Ready to collect": freezes the draft into a new intent and opens the reader. */
  const arm = (draft: CollectDraft): boolean => {
    if (!collector) return false;
    const intent: CollectIntent = { id: crypto.randomUUID(), collector, ...draft };
    const next = armCollectIntent(useCollectSession.getState().session, intent, "card");
    if (!next) return false;
    setNotice(null);
    applySession(() => next);
    if (!scanActive) scan.start();
    return true;
  };

  /**
   * Charges the held card again for the amount now on screen, without a tap.
   * A deliberate collector action, and the only thing that releases the latch.
   */
  const collectAgain = (draft: CollectDraft): boolean => {
    const payer = useCollectPayerKey.getState().payer;
    if (!collector || !payer) return false;
    const intent: CollectIntent = { id: crypto.randomUUID(), collector, ...draft };
    const armed = armCollectIntent(
      disarmCollectIntent(useCollectSession.getState().session),
      intent,
      "retained",
    );
    if (!armed) return false;
    const claim = claimCollectIntent(armed, payer, "retained");
    if (!claim.ok) {
      setNotice({ kind: claim.reason });
      return false;
    }
    setNotice(null);
    applySession(() => claim.session);
    void runPayment(claim.intent, payer);
    return true;
  };

  const completeUnlock = async (key: `0x${string}`) => {
    if (!unlock) return;
    const payer = privateKeyToAccount(key).address;
    const result = completeCollectUnlock(
      useCollectSession.getState().session,
      unlock.intentId,
      payer,
    );
    applySession(() => result.session);
    setUnlock(null);
    if (!result.ok) {
      setNotice({ kind: result.reason });
      return;
    }
    useCollectPayerKey.getState().retain(key);
    void runPayment(result.intent, payer);
  };

  const cancelUnlock = () => {
    if (!unlock) return;
    const { intentId } = unlock;
    applySession((current) => cancelCollectUnlock(current, intentId));
    setUnlock(null);
  };

  /** "Done with this customer": the held key goes; the latch deliberately stays. */
  const finishCustomer = () => {
    useCollectPayerKey.getState().clear();
    applySession(finishCollectCustomer);
    setNotice(null);
  };

  const cancelArmed = () => {
    applySession(disarmCollectIntent);
    setNotice(null);
  };

  /** The tracked payment settled. Frees its payer for another collection. */
  const settle = useCallback((operationId: string, outcome: "confirmed" | "failed") => {
    markNfc(operationId, outcome === "confirmed" ? "tracking-confirmed" : "tracking-failed");
    useCollectSubmissions.getState().update(operationId, { status: outcome });
    applySession((current) => resolveCollectPayment(current, operationId));
  }, []);

  const mySubmissions = collector
    ? submissions.filter((entry) => entry.collector.toLowerCase() === collector.toLowerCase())
    : [];

  return {
    session,
    heldPayer,
    notice,
    unlock,
    scan,
    health,
    submissions: mySubmissions,
    arm,
    collectAgain,
    completeUnlock,
    cancelUnlock,
    finishCustomer,
    cancelArmed,
    settle,
  };
}
