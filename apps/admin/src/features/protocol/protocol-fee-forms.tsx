import { POOL_FEE_PERCENT_DECIMALS } from "@clc/core/features/pool-admin/logic";
import {
  buildSetProtocolFeeCall,
  buildSetProtocolFeeRecipientCall,
} from "@clc/core/features/protocol-admin/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ProtocolFieldError } from "./protocol-contract-loader";
import { protocolAddressSchema, protocolPercentSchema } from "./protocol-form-schemas";

export function ProtocolFeeForms({
  controllerAddress,
  pending,
  onSend,
}: {
  controllerAddress: `0x${string}`;
  pending: boolean;
  onSend: (label: string, build: () => CaliburCall) => Promise<boolean>;
}) {
  const fee = useForm({
    defaultValues: { percent: "" },
    validators: { onSubmit: z.object({ percent: protocolPercentSchema }) },
    onSubmit: async ({ value }) => {
      await onSend("Protocol fee updated", () =>
        buildSetProtocolFeeCall({
          controllerAddress,
          feePpm: parseTokenAmount(value.percent.trim(), POOL_FEE_PERCENT_DECIMALS),
        }),
      );
    },
  });
  const recipient = useForm({
    defaultValues: { recipient: "" },
    validators: { onSubmit: z.object({ recipient: protocolAddressSchema }) },
    onSubmit: async ({ value }) => {
      await onSend("Recipient updated", () =>
        buildSetProtocolFeeRecipientCall({
          controllerAddress,
          recipientAddress: value.recipient.trim() as `0x${string}`,
        }),
      );
    },
  });

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void fee.handleSubmit();
        }}
      >
        <fee.Field name="percent">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="protocol-percent">Percent</Label>
              <Input
                id="protocol-percent"
                inputMode="decimal"
                className="font-data"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <ProtocolFieldError message={getFieldError(field.state.meta.errors)} />
            </div>
          )}
        </fee.Field>
        <Button type="submit" disabled={pending}>
          Save fee
        </Button>
      </form>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void recipient.handleSubmit();
        }}
      >
        <recipient.Field name="recipient">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="protocol-recipient">Recipient</Label>
              <Input
                id="protocol-recipient"
                className="font-data"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <ProtocolFieldError message={getFieldError(field.state.meta.errors)} />
            </div>
          )}
        </recipient.Field>
        <Button type="submit" variant="outline" disabled={pending}>
          Save recipient
        </Button>
      </form>
    </>
  );
}
