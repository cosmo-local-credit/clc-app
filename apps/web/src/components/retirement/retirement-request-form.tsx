import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { retirementPreviewQueryOptions } from "@clc/api/features/retirement/queries";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { formatUnits } from "viem";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Textarea } from "#/components/ui/textarea";
import { useRequestRetirement } from "#/features/retirement/hooks/use-retirement-mutations";
import { retirementClient } from "#/lib/api/retirement";

export function RetirementRequestForm({
  type,
  address,
  viewer,
  onSubmitted,
}: {
  type: RetirementResourceType;
  address: string;
  viewer: string;
  onSubmitted: () => void;
}) {
  const { t } = useLingui();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const preview = useQuery(retirementPreviewQueryOptions(retirementClient, type, address, viewer));
  const request = useRequestRetirement(type, address);
  const checked = preview.data;
  const amount =
    checked?.amountOutsideOwnerRaw !== null && checked?.amountOutsideOwnerRaw !== undefined
      ? formatUnits(BigInt(checked.amountOutsideOwnerRaw), checked.decimals)
      : null;
  const symbol = checked?.symbol ?? "";
  const count = checked?.positiveTokenCount ?? 0;
  const canSubmit =
    !!checked?.active && !preview.isError && !preview.isFetching && reason.trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || request.isPending) return;
        request.mutate(reason, { onSuccess: onSubmitted });
      }}
    >
      {preview.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Checking balances…</Trans>
        </p>
      ) : preview.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">
            <Trans>Could not check balances. Try again before submitting your request.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : checked ? (
        <div className="space-y-2 border border-border bg-muted p-3 text-sm" role="status">
          {type === "voucher" ? (
            <p>
              <Trans>
                Other accounts hold{" "}
                <strong>
                  {amount} {symbol}
                </strong>{" "}
                of your voucher.
              </Trans>
            </p>
          ) : (
            <p>
              <Plural
                value={count}
                one="Your pool holds # known voucher type with a positive balance."
                other="Your pool holds # known voucher types with positive balances."
              />
            </p>
          )}
          {type === "pool" ? (
            <p className="text-xs text-muted-foreground">
              <Trans>
                This check includes known pool holdings. Tokens not yet tracked may be missing.
              </Trans>
            </p>
          ) : null}
          {!checked.active ? (
            <p>
              <Trans>This resource is already retired.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm">
        {type === "voucher" ? (
          <Trans>Are you sure you want to request retirement of this voucher?</Trans>
        ) : (
          <Trans>Are you sure you want to request retirement of this pool?</Trans>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        <Trans>An admin will review your request. It will stay active until approval.</Trans>
      </p>
      <p className="text-sm text-muted-foreground">
        <Trans>
          Retirement does not delete the voucher or pool from the blockchain. Existing balances and
          transaction history remain.
        </Trans>
      </p>
      {type === "pool" ? (
        <p className="text-sm text-muted-foreground">
          <Trans>You can still withdraw funds after the pool is retired.</Trans>
        </p>
      ) : null}
      <Field label={t`Reason for retirement`} htmlFor={reasonId}>
        <Textarea
          id={reasonId}
          required
          maxLength={2000}
          value={reason}
          disabled={request.isPending}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {request.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {request.error.message}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="destructive"
        tap
        className="w-full"
        disabled={!canSubmit}
        pending={request.isPending}
      >
        {request.isPending ? <Trans>Submitting request…</Trans> : <Trans>Request retirement</Trans>}
      </Button>
    </form>
  );
}
