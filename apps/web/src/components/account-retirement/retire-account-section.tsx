import { MAX_ACCOUNT_REASON_LENGTH } from "@clc/core/features/account-retirement/logic";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";

import { AgreementField } from "#/components/ui/agreement-field";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { Textarea } from "#/components/ui/textarea";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  useAccountRetirementPreview,
  useRetireAccount,
} from "#/features/account-retirement/hooks/use-account-retirement";

/**
 * The way out of an account, at the foot of Edit profile and outside its form.
 * A superadmin never sees it: the server refuses to retire one.
 */
export function RetireAccountSection() {
  const auth = useAuthStatus();
  const headingId = useId();
  const [open, setOpen] = useState(false);

  if (auth.session?.role === "SUPERADMIN") return null;

  return (
    <section aria-labelledby={headingId} className="mt-8 border border-destructive/40 bg-card p-4">
      <SectionHeading id={headingId} variant="group" className="text-destructive">
        <Trans>Retire account</Trans>
      </SectionHeading>
      <Button variant="destructive" tap className="mt-3 w-full" onClick={() => setOpen(true)}>
        <Trans>Retire account</Trans>
      </Button>
      <RetireAccountSheet open={open} onOpenChange={setOpen} />
    </section>
  );
}

function RetireAccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useLingui();
  const reasonId = useId();
  const acknowledgedId = useId();
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const preview = useAccountRetirementPreview(open);
  const retire = useRetireAccount();
  const data = preview.data;

  const close = () => {
    onOpenChange(false);
    setReason("");
    setAcknowledged(false);
    retire.reset();
  };
  const canSubmit = !!data && acknowledged && !retire.isPending;
  const closesAt = data ? i18n.date(data.closesAt, { dateStyle: "long" }) : "";

  return (
    <SettingsSheet
      open={open}
      onOpenChange={(next) => {
        // A retirement under way finishes first: closing now would hide its outcome.
        if (!next && !retire.isPending) close();
      }}
      title={t`Retire your account?`}
      footer={
        <>
          <Button
            variant="destructive"
            tap
            className="w-full"
            disabled={!canSubmit}
            pending={retire.isPending}
            onClick={() => retire.mutate(reason, { onSuccess: close })}
          >
            {retire.isPending ? t`Retiring…` : t`Confirm retirement`}
          </Button>
          <Button
            variant="outline"
            tap
            className="w-full"
            disabled={retire.isPending}
            onClick={close}
          >
            <Trans>Cancel</Trans>
          </Button>
        </>
      }
    >
      {preview.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          <Trans>Checking what retiring changes…</Trans>
        </p>
      ) : preview.isError || !data ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">
            <Trans>Could not check what retiring changes.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2 border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>
              <Trans>
                Your account closes on <time dateTime={data.closesAt}>{closesAt}</time>. You can
                restore it until then.
              </Trans>
            </p>
            <p>
              <Trans>
                After that your account can be erased. Erasure cannot be undone. Blockchain records
                stay public either way.
              </Trans>
            </p>
          </div>

          {data.ownedResources.length > 0 ? (
            <section className="space-y-1.5">
              <SectionHeading variant="group">
                <Trans>Stay active</Trans>
              </SectionHeading>
              <ul className="border border-border bg-card">
                {data.ownedResources.map((resource) => (
                  <li
                    key={`${resource.resourceType}:${resource.address}`}
                    className="flex items-center gap-2 border-border border-b p-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-sm">
                      {resource.name}
                    </span>
                    <Badge size="sm" caps>
                      {resource.resourceType === "voucher" ? (
                        <Trans>Voucher</Trans>
                      ) : (
                        <Trans>Pool</Trans>
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-1.5">
            <SectionHeading variant="group">
              <Trans>Hidden until restored</Trans>
            </SectionHeading>
            <ul className="border border-border bg-card text-sm">
              <HiddenCount label={t`Wants`} count={data.hiddenContent.wants} />
              <HiddenCount label={t`Catalogs`} count={data.hiddenContent.catalogs} />
              <HiddenCount label={t`Posts`} count={data.hiddenContent.posts} />
              <HiddenCount label={t`Reviews`} count={data.hiddenContent.reviews} />
            </ul>
          </section>

          {data.pendingResourceRequests > 0 ? (
            <p className="text-sm">
              <Plural
                value={data.pendingResourceRequests}
                one="# retirement request is still awaiting review."
                other="# retirement requests are still awaiting review."
              />
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">{data.balancesCoverageNote}</p>
          <p className="text-muted-foreground text-xs">{data.pendingOperationsNote}</p>

          <div>
            <label htmlFor={reasonId} className="mb-1.5 block font-medium text-sm">
              <Trans>Reason</Trans>
              <span className="ms-1 font-normal text-muted-foreground">
                <Trans>Optional</Trans>
              </span>
            </label>
            <Textarea
              id={reasonId}
              maxLength={MAX_ACCOUNT_REASON_LENGTH}
              value={reason}
              disabled={retire.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
            <p dir="ltr" className="mt-1 text-end font-mono text-muted-foreground text-xs">
              {reason.length}/{MAX_ACCOUNT_REASON_LENGTH}
            </p>
          </div>

          <AgreementField
            id={acknowledgedId}
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
            disabled={retire.isPending}
          >
            <Trans>
              I understand the closing date, the content that will be hidden, the limits on
              recovery, and that blockchain records stay public.
            </Trans>
          </AgreementField>
        </>
      )}
      {retire.isError ? <SettingsSheetAlert>{retire.error.message}</SettingsSheetAlert> : null}
    </SettingsSheet>
  );
}

function HiddenCount({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-center justify-between gap-3 border-border border-b p-3 last:border-b-0">
      <span>{label}</span>
      <span dir="ltr" className="font-mono font-semibold">
        {count}
      </span>
    </li>
  );
}
