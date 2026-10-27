import type { PoolVoucher } from "@clc/api/features/pools/client";
import { useLingui } from "@lingui/react/macro";
import type { FormEvent, ReactNode } from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";

/** What the pool page's side column shows in place of the swap. */
export type PoolSide =
  | { kind: "details" }
  | { kind: "liquidity" }
  | { kind: "fees" }
  | { kind: "feeSettings" }
  | { kind: "ownership" }
  | { kind: "retirement" }
  | { kind: "approve" }
  | { kind: "voucher"; voucher: PoolVoucher }
  | { kind: "activity"; entry: PoolActivityEntry };

/**
 * The side column as an inspector: a 52px header with Close, a body that
 * scrolls inside the viewport (the column is sticky, so a taller panel would
 * otherwise hide its own footer), and an optional footer for the actions.
 */
export function PoolSidePanel({
  title,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** Makes the panel a form, so Enter submits and the footer's submit button works. */
  onSubmit?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const content = (
    <>
      <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b ps-4 pe-2">
        <SectionHeading as="h2" variant="section" className="min-w-0 truncate">
          {title}
        </SectionHeading>
        <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">{children}</div>
      {footer ? (
        <div className="grid shrink-0 gap-2 border-border border-t p-4">{footer}</div>
      ) : null}
    </>
  );
  const className =
    "flex max-h-[calc(100dvh-7.5rem)] min-h-0 min-w-0 flex-col border border-border bg-card";
  return onSubmit ? (
    <form
      className={className}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {content}
    </form>
  ) : (
    <section className={className}>{content}</section>
  );
}
