import {
  safeSignerChangeProblem,
  type SafeOwnerInfo,
  type SafeSignerChangeRequest,
  type SafeSignerState,
} from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import { RiShieldCheckLine, RiTeamLine, RiUserAddLine, RiUserUnfollowLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import { SectionHeading } from "#/components/ui/section-heading";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { EllipsizedAddress, HighlightAddress } from "#/components/wallet";
import {
  RecipientAddressInput,
  type ResolvedRecipientAddress,
} from "#/components/wallet/recipient-address-input";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";
import { useProposeSignerChange, useSafeSigners } from "#/features/safe/hooks/use-safe-signers";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";

type Step =
  | { kind: "overview" }
  | { kind: "add" }
  | { kind: "remove"; signer: `0x${string}` }
  | { kind: "threshold" };

/** Settings' Multisig rows: one per Safe the signed-in account signs for. */
export function MultisigSettingsRows({ safes }: { safes: readonly SafeOwnerInfo[] }) {
  return safes.map((safe) => (
    <MultisigSettingsRow key={safe.owner} safe={safe.owner as `0x${string}`} />
  ));
}

/**
 * One Safe's signers and approvals, and proposals to change them. Proposals
 * join the Safe's queue like any other; the other signers confirm them in
 * Multisig transactions or in Safe.
 */
function MultisigSettingsRow({ safe }: { safe: `0x${string}` }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "overview" });
  const [query, setQuery] = useState("");
  const [newSigner, setNewSigner] = useState<ResolvedRecipientAddress | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const signers = useSafeSigners(safe, open);
  const propose = useProposeSignerChange(safe);
  const report = useReportWriteError();
  const state = signers.data;

  const choose = (next: Step) => {
    setStep(next);
    setQuery("");
    setNewSigner(null);
    setThreshold(null);
  };
  const submit = (change: SafeSignerChangeRequest) =>
    propose.mutate(change, {
      onError: (error) => {
        if (report(error, t`Failed`)) setOpen(false);
      },
    });

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

  // The change each step would propose, once its choices are made.
  let change: SafeSignerChangeRequest | null = null;
  if (state && step.kind === "add" && newSigner) {
    change = {
      kind: "addSigner",
      signer: newSigner.address,
      threshold: threshold ?? state.threshold,
    };
  } else if (state && step.kind === "remove") {
    change = {
      kind: "removeSigner",
      signer: step.signer,
      threshold: threshold ?? Math.min(state.threshold, state.owners.length - 1),
    };
  } else if (state && step.kind === "threshold") {
    change = { kind: "changeThreshold", threshold: threshold ?? state.threshold };
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

  const back = (
    <Button
      variant="outline"
      tap
      className="w-full"
      disabled={propose.isPending}
      onClick={() => choose({ kind: "overview" })}
    >
      <Trans>Back</Trans>
    </Button>
  );
  const proposeButton = (
    <Button
      tap
      className="w-full"
      variant={step.kind === "remove" ? "destructive" : "default"}
      pending={propose.isPending}
      disabled={!change || problem !== null}
      onClick={() => {
        if (change) submit(change);
      }}
    >
      {propose.isPending ? <Trans>Proposing…</Trans> : <Trans>Propose</Trans>}
    </Button>
  );

  let footer = null;
  if (signers.isError) {
    footer = (
      <Button variant="outline" tap className="w-full" onClick={() => void signers.refetch()}>
        <Trans>Try again</Trans>
      </Button>
    );
  } else if (state && step.kind === "overview") {
    footer = (
      <>
        <Button tap className="w-full" onClick={() => choose({ kind: "add" })}>
          <RiUserAddLine aria-hidden="true" />
          <Trans>Add signer</Trans>
        </Button>
        <Button
          variant="outline"
          tap
          className="w-full"
          onClick={() => {
            setOpen(false);
            useSafeSheet.getState().show(safe);
          }}
        >
          <Trans>Multisig transactions</Trans>
        </Button>
      </>
    );
  } else if (state) {
    footer = (
      <>
        {proposeButton}
        {back}
      </>
    );
  }

  return (
    <>
      <ActionRow
        icon={<RiTeamLine className="size-4" aria-hidden="true" />}
        label={t`Signers and approvals`}
        value={<EllipsizedAddress address={safe} />}
        onClick={() => {
          choose({ kind: "overview" });
          setOpen(true);
        }}
      />
      <SettingsSheet open={open} onOpenChange={setOpen} title={title} footer={footer}>
        {signers.isError ? (
          <SettingsSheetAlert>
            <Trans>This multisig's signers could not be read.</Trans>
          </SettingsSheetAlert>
        ) : !state ? (
          <SignersSkeleton />
        ) : step.kind === "overview" ? (
          <Overview
            state={state}
            onRemove={(signer) => choose({ kind: "remove", signer })}
            onChangeThreshold={() => choose({ kind: "threshold" })}
          />
        ) : step.kind === "add" ? (
          <>
            <NewSignerField
              query={query}
              onQueryChange={setQuery}
              onRecipientChange={setNewSigner}
              error={problemText}
            />
            <ApprovalsChoice
              total={state.owners.length + 1}
              value={threshold ?? state.threshold}
              onChange={setThreshold}
            />
          </>
        ) : step.kind === "remove" ? (
          <>
            <div className="border border-border bg-card p-3">
              <RecipientIdentityLabel
                address={step.signer}
                showAddress
                className="items-start text-start"
              />
            </div>
            <ApprovalsChoice
              total={state.owners.length - 1}
              value={threshold ?? Math.min(state.threshold, state.owners.length - 1)}
              onChange={setThreshold}
            />
          </>
        ) : (
          <ApprovalsChoice
            total={state.owners.length}
            value={threshold ?? state.threshold}
            onChange={setThreshold}
          />
        )}
      </SettingsSheet>
    </>
  );
}

function Overview({
  state,
  onRemove,
  onChangeThreshold,
}: {
  state: SafeSignerState;
  onRemove: (signer: `0x${string}`) => void;
  onChangeThreshold: () => void;
}) {
  const { t } = useLingui();
  const headingId = useId();
  return (
    <>
      <HighlightAddress address={state.safe} tailLength={5} className="block text-foreground" />
      <section aria-labelledby={headingId} className="space-y-2">
        <SectionHeading id={headingId} as="h3" variant="group">
          {t`Signers`}
        </SectionHeading>
        <ul className="divide-y divide-border border border-border bg-card">
          {state.owners.map((owner) => (
            <li
              key={owner}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5"
            >
              <RecipientIdentityLabel
                address={owner}
                showAddress
                className="items-start text-start"
              />
              <Button
                variant="outline"
                size="icon"
                tap
                aria-label={t`Remove signer`}
                disabled={state.owners.length === 1}
                onClick={() => onRemove(owner)}
              >
                <RiUserUnfollowLine aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <div className="border border-border bg-card">
        <ActionRow
          icon={<RiShieldCheckLine className="size-4" aria-hidden="true" />}
          label={t`Approvals required`}
          value={<ApprovalsOf required={state.threshold} total={state.owners.length} />}
          onClick={onChangeThreshold}
        />
      </div>
    </>
  );
}

function NewSignerField({
  query,
  onQueryChange,
  onRecipientChange,
  error,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onRecipientChange: (recipient: ResolvedRecipientAddress | null) => void;
  error: string | null;
}) {
  const { t } = useLingui();
  const id = useId();
  return (
    <Field label={t`New signer`} htmlFor={id} error={error}>
      <RecipientAddressInput
        id={id}
        ariaLabel={t`New signer`}
        ariaInvalid={Boolean(error)}
        value={query}
        onValueChange={onQueryChange}
        onRecipientChange={onRecipientChange}
      />
    </Field>
  );
}

/** "n of m" in the active locale's digits. */
function ApprovalsOf({ required, total }: { required: number; total: number }) {
  const { i18n } = useLingui();
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const count = digits.format(required);
  const signers = digits.format(total);
  return (
    <Trans>
      {count} of {signers}
    </Trans>
  );
}

function ApprovalsChoice({
  total,
  value,
  onChange,
}: {
  total: number;
  value: number;
  onChange: (threshold: number) => void;
}) {
  const { t } = useLingui();
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="mb-1.5 font-medium text-sm">
        {t`Approvals required`}
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        value={String(value)}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(Number(next));
        }}
        className="gap-0 border border-border bg-card"
      >
        {Array.from({ length: total }, (_, index) => index + 1).map((required) => (
          <RadioGroupRow
            key={required}
            value={String(required)}
            label={<ApprovalsOf required={required} total={total} />}
          />
        ))}
      </RadioGroup>
    </div>
  );
}

function SignersSkeleton() {
  return (
    <div className="divide-y divide-border border border-border bg-card" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex min-h-11 items-center px-3">
          <Skeleton className="h-3.5 w-40 rounded-none" />
        </div>
      ))}
    </div>
  );
}
