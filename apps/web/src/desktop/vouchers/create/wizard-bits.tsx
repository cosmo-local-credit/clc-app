import type { ReactNode } from "react";

import type { useCreateVoucherForm } from "#/features/vouchers/hooks/use-create-voucher-form";

/** The shared voucher form and step machine the desktop steps draw. */
export type VoucherWizard = ReturnType<typeof useCreateVoucherForm>;

/** `.form-foot`: a rule, then the step's buttons at the end. */
export function FormFoot({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 border-border border-t pt-4">{children}</div>;
}
