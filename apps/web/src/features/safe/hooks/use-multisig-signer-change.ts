import {
  safeSignerChangeProblem,
  type SafeSignerChangeRequest,
} from "@clc/core/features/safe/logic";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import type { ResolvedRecipientAddress } from "#/components/wallet/recipient-address-input";

import { useSafeSheet } from "../state/safe-sheet";
import { useReportWriteError } from "./use-report-write-error";
import { useProposeSignerChange, useSafeSigners } from "./use-safe-signers";

export type MultisigSignerStep =
  | { kind: "overview" }
  | { kind: "add" }
  | { kind: "remove"; signer: `0x${string}` }
  | { kind: "threshold" };

/**
 * One Safe's signers and approvals, and the proposal each step would make, for
 * Settings in either view. Proposals join the Safe's queue like any other; the
 * other signers confirm them in Multisig transactions or in Safe.
 *
 * `open` gates the signer read; `onClose` closes the caller's sheet or dialog
 * when a proposal moves on to the Safe's queue.
 */
export function useMultisigSignerChange(
  safe: `0x${string}`,
  { open, onClose }: { open: boolean; onClose: () => void },
) {
  const { t } = useLingui();
  const [step, setStep] = useState<MultisigSignerStep>({ kind: "overview" });
  const [query, setQuery] = useState("");
  const [newSigner, setNewSigner] = useState<ResolvedRecipientAddress | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const signers = useSafeSigners(safe, open);
  const propose = useProposeSignerChange(safe);
  const report = useReportWriteError();
  const state = signers.data;

  const choose = (next: MultisigSignerStep) => {
    setStep(next);
    setQuery("");
    setNewSigner(null);
    setThreshold(null);
  };

  let title: string;
  switch (step.kind) {
    case "add":
      title = t`Add signer`;
      break;
    case "remove":
      title = t`Remove signer`;
      break;
    case "threshold":
      title = t`Change approvals required`;
      break;
    default:
      title = t`Multisig`;
  }

  // The change each step would propose once its choices are made, and the
  // approvals it may ask for.
  let change: SafeSignerChangeRequest | null = null;
  let approvals: { total: number; value: number } | null = null;
  if (state && step.kind === "add") {
    approvals = { total: state.owners.length + 1, value: threshold ?? state.threshold };
    if (newSigner) {
      change = { kind: "addSigner", signer: newSigner.address, threshold: approvals.value };
    }
  } else if (state && step.kind === "remove") {
    approvals = {
      total: state.owners.length - 1,
      value: threshold ?? Math.min(state.threshold, state.owners.length - 1),
    };
    change = { kind: "removeSigner", signer: step.signer, threshold: approvals.value };
  } else if (state && step.kind === "threshold") {
    approvals = { total: state.owners.length, value: threshold ?? state.threshold };
    change = { kind: "changeThreshold", threshold: approvals.value };
  }
  const problem = state && change ? safeSignerChangeProblem(state, change) : null;
  let problemText: string | null = null;
  switch (problem) {
    case "not-a-signer-address":
      problemText = t`This address can't be a signer.`;
      break;
    case "already-signer":
      problemText = t`This address is already a signer.`;
      break;
  }

  return {
    signers,
    state,
    step,
    choose,
    title,
    query,
    setQuery,
    setNewSigner,
    approvals,
    setThreshold,
    problemText,
    canPropose: change !== null && problem === null,
    proposing: propose.isPending || propose.inFlight,
    propose: () => {
      if (!change) return;
      propose.mutate(change, {
        onError: (error) => {
          if (report(error, t`Failed`)) onClose();
        },
      });
    },
    openQueue: () => {
      onClose();
      useSafeSheet.getState().show(safe);
    },
  };
}
