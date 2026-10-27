import type { UserPool } from "@clc/api/features/pools/client";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { z } from "zod";

import {
  ownershipKey,
  useOwnershipSubmissions,
} from "#/features/ownership/state/ownership-submissions";
import { usePoolOwnershipTransfer } from "#/features/pools/hooks/use-pool-ownership-transfer";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";

/**
 * The transfer-ownership form: the recipient field, validated against the
 * pool's own contracts, and the submission a previous attempt left behind.
 */
export function usePoolOwnershipTransferForm({
  pool,
  onDone,
}: {
  pool: UserPool;
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
  return { form, transfer, submission };
}
