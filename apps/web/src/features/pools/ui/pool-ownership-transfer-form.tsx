import type { UserPool } from "@clc/api/features/pools/client";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { SheetFooter } from "#/components/ui/sheet";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import {
  ownershipKey,
  useOwnershipSubmissions,
} from "#/features/ownership/state/ownership-submissions";
import { RecipientOwnerNotice } from "#/components/safe/recipient-owner-notice";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";
import { usePoolOwnershipTransfer } from "#/features/pools/hooks/use-pool-ownership-transfer";
import type { PoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";

export function PoolOwnershipTransferForm({
  pool,
  settings,
  onDone,
}: {
  pool: UserPool;
  settings: PoolFeeSettings | undefined;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const transfer = usePoolOwnershipTransfer(pool);
  const reportError = useReportWriteError();
  const submission = useOwnershipSubmissions(
    (state) => state.submissions[ownershipKey(pool.address)],
  );
  const contracts = [
    pool.address,
    pool.tokenRegistryAddress,
    pool.limiterAddress,
    pool.feePolicyAddress,
    pool.quoterAddress,
    pool.protocolFeeControllerAddress,
  ];
  const form = useForm({
    defaultValues: { newOwnerAddress: String(submission?.newOwnerAddress ?? "") },
    validators: {
      onSubmit: z.object({
        newOwnerAddress: ownershipRecipientSchema(pool.ownerAddress ?? "", contracts),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!pool.ownerAddress) return;
      try {
        const result = await transfer.mutateAsync({
          assetAddress: pool.address,
          ownerAddress: pool.ownerAddress,
          newOwnerAddress: value.newOwnerAddress.trim() as `0x${string}`,
        });
        if (result.catalogSynced) toast.success(t`Pool ownership transferred.`);
        else
          toast.info(
            t`Ownership transferred on-chain. Catalog synchronization is delayed; your management controls have been removed.`,
          );
        onDone();
      } catch (error) {
        if (reportError(error, t`Couldn't transfer ownership.`)) onDone();
      }
    },
  });
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <p className="text-sm">
          <Trans>
            The recipient gains pool management and liquidity withdrawal authority. You lose
            ownership immediately when the transaction confirms.
          </Trans>
        </p>
        <Field label={t`Existing fee recipient`} htmlFor="pool-existing-fee-recipient">
          <output id="pool-existing-fee-recipient" className="block break-all font-mono text-sm">
            {settings ? (settings.feeAddress ?? t`Not set`) : t`Reading…`}
          </output>
        </Field>
        {submission ? (
          <p role="status" className="break-all text-xs">
            <Trans>Check the existing submission before another transfer:</Trans>{" "}
            <span className="font-mono">{submission.trackingId}</span>
          </p>
        ) : null}
        <form.Field name="newOwnerAddress">
          {(field) => (
            <Field
              label={t`New owner address`}
              htmlFor="pool-new-owner"
              error={getFieldError(field.state.meta.errors)}
            >
              <RecipientAddressInput
                id="pool-new-owner"
                defaultValue={field.state.value}
                onValueChange={field.handleChange}
                onRecipientChange={(recipient) => {
                  if (recipient) field.handleChange(recipient.address);
                }}
                onBlur={field.handleBlur}
                ariaLabel={t`New owner address`}
                ariaInvalid={field.state.meta.errors.length > 0}
                disabled={transfer.isPending || !!submission}
              />
              <RecipientOwnerNotice address={field.state.value} />
            </Field>
          )}
        </form.Field>
      </div>
      <SheetFooter>
        <Button
          type="submit"
          tap
          className="w-full"
          pending={transfer.isPending}
          disabled={!settings && !submission}
        >
          {transfer.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : submission ? (
            <Trans>Check transfer status</Trans>
          ) : (
            <Trans>Transfer ownership</Trans>
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
