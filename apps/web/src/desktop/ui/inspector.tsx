import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/** The 380px column over a dimmed canvas. The page owns what it shows. */
export function DeskInspector({
  title,
  children,
  onClose,
  footer,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useLingui();
  return (
    <aside
      className={cn(
        "flex min-h-0 w-[380px] shrink-0 flex-col border-border border-s bg-card",
        className,
      )}
    >
      <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
            <RiCloseLine />
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">{children}</div>
      {footer ? <div className="border-border border-t p-4">{footer}</div> : null}
    </aside>
  );
}

export function DeskSplit({
  main,
  side,
  dimmed = false,
}: {
  main: ReactNode;
  side: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn("min-w-0 flex-1 overflow-y-auto", dimmed && "pointer-events-none opacity-40")}
        inert={dimmed || undefined}
      >
        {main}
      </div>
      {side}
    </div>
  );
}
