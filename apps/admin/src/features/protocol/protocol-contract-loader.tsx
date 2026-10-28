import { getFieldError, useForm } from "@clc/core/lib/forms";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { protocolAddressSchema } from "./protocol-form-schemas";

export function ProtocolContractLoader({
  id,
  label,
  onLoad,
  pending,
}: {
  id: string;
  label: string;
  onLoad: (address: string) => void;
  pending: boolean;
}) {
  const form = useForm({
    defaultValues: { address: "" },
    validators: { onSubmit: z.object({ address: protocolAddressSchema }) },
    onSubmit: ({ value }) => onLoad(value.address.trim()),
  });
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="address">
        {(field) => (
          <>
            <Label htmlFor={id}>{label}</Label>
            <div className="flex gap-2">
              <Input
                id={id}
                className="font-data"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <Button type="submit" variant="outline" disabled={pending}>
                Load
              </Button>
            </div>
            <ProtocolFieldError message={getFieldError(field.state.meta.errors)} />
          </>
        )}
      </form.Field>
    </form>
  );
}

export function ProtocolFieldError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-destructive text-xs">
      {message}
    </p>
  ) : null;
}
