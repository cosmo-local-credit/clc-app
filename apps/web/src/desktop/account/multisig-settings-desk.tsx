import type { SafeOwnerInfo, SafeSignerState } from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import { RiCloseLine, RiUserAddLine, RiUserUnfollowLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
import { RadioGroup, RadioGroupRow } from "#/components/ui/radio-group";
import { SectionHeading } from "#/components/ui/section-heading";
import { SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { EllipsizedAddress, HighlightAddress } from "#/components/wallet/wallet-address";
import {
  RecipientAddressInput,
  type ResolvedRecipientAddress,
} from "#/components/wallet/recipient-address-input";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useMultisigSignerChange } from "#/features/safe/hooks/use-multisig-signer-change";

import { SetRow } from "./set-row";

/** Settings' Multisig rows: one per Safe the signed-in account signs for. */
export function MultisigSettingsDeskRows({ safes }: { safes: readonly SafeOwnerInfo[] }) {
  return safes.map((safe) => <MultisigRow key={safe.owner} safe={safe.owner as `0x${string}`} />);
}

/**
 * One Safe's signers and approvals as a dialog: the overview, then a step to
 * add or remove a signer or change the approvals, each ending in a proposal
 * the other signers confirm in Multisig transactions or in Safe.
 */
function MultisigRow({ safe }: { safe: `0x${string}` }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const {
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
    canPropose,
    proposing,
    propose,
    openQueue,
  } = useMultisigSignerChange(safe, { open, onClose: () => setOpen(false) });

  let footer = null;
  if (signers.isError) {
    footer = (
      <Button variant="outline" onClick={() => void signers.refetch()}>
        <Trans>Try again</Trans>
      </Button>
    );
  } else if (state && step.kind === "overview") {
    footer = (
      <>
        <Button variant="outline" onClick={openQueue}>
          <Trans>Multisig transactions</Trans>
        </Button>
        <Button onClick={() => choose({ kind: "add" })}>
          <RiUserAddLine aria-hidden="true" />
          <Trans>Add signer</Trans>
        </Button>
      </>
    );
  } else if (state) {
    footer = (
      <>
        <Button variant="outline" disabled={proposing} onClick={() => choose({ kind: "overview" })}>
          <Trans>Back</Trans>
        </Button>
        <Button
          variant={step.kind === "remove" ? "destructive" : "default"}
          pending={proposing}
          disabled={!canPropose}
          onClick={propose}
        >
          {proposing ? <Trans>Proposing…</Trans> : <Trans>Propose</Trans>}
        </Button>
      </>
    );
  }

  return (
    <>
      <SetRow
        label={t`Signers and approvals`}
        value={<EllipsizedAddress address={safe} className="text-foreground" />}
        action={
          <Button
            variant="ghost"
            onClick={() => {
              choose({ kind: "overview" });
              setOpen(true);
            }}
          >
            <Trans>Manage</Trans>
          </Button>
        }
      />
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="flex max-h-[85dvh] w-[480px] max-w-[480px] flex-col rounded-none border border-border bg-card p-0 shadow-none">
            <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
              <DialogTitle>{title}</DialogTitle>
              <DialogClose
                render={
                  <Button type="button" variant="ghost" size="icon" aria-label={t`Close`}>
                    <RiCloseLine aria-hidden="true" />
                  </Button>
                }
              />
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
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
              ) : (
                <>
                  {step.kind === "add" ? (
                    <NewSignerField
                      query={query}
                      onQueryChange={setQuery}
                      onRecipientChange={setNewSigner}
                      error={problemText}
                    />
                  ) : step.kind === "remove" ? (
                    <div className="border border-border bg-card p-3">
                      <RecipientIdentityLabel
                        address={step.signer}
                        showAddress
                        className="items-start text-start"
                      />
                    </div>
                  ) : null}
                  {approvals ? (
                    <ApprovalsChoice
                      total={approvals.total}
                      value={approvals.value}
                      onChange={setThreshold}
                    />
                  ) : null}
                </>
              )}
            </div>
            {footer ? (
              <div className="flex shrink-0 justify-end gap-2 border-border border-t p-4">
                {footer}
              </div>
            ) : null}
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
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
      <section aria-labelledby={headingId} className="grid gap-2">
        <SectionHeading id={headingId} as="h3" variant="group">
          {t`Signers`}
        </SectionHeading>
        <ul className="divide-y divide-border border border-border bg-card">
          {state.owners.map((owner) => (
            <li key={owner} className="flex min-h-11 items-center justify-between gap-3 ps-3 pe-1">
              <RecipientIdentityLabel
                address={owner}
                showAddress
                className="items-start text-start"
              />
              <Button
                variant="ghost"
                size="icon"
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
      <div className="flex min-h-11 items-center justify-between gap-3 border border-border bg-card ps-3 pe-1">
        <span className="text-sm font-semibold">{t`Approvals required`}</span>
        <span className="ms-auto text-xs text-muted-foreground">
          <ApprovalsOf required={state.threshold} total={state.owners.length} />
        </span>
        <Button
          variant="ghost"
          aria-label={t`Change approvals required`}
          onClick={onChangeThreshold}
        >
          <Trans>Change</Trans>
        </Button>
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
      <p id={labelId} className="mb-1.5 text-sm font-medium">
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
