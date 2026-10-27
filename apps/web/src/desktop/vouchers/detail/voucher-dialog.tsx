import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { cn } from "#/lib/utils";

/**
 * The voucher page's forms and details as a centred desktop dialog: a 52px
 * header with the title and a close button, a body that scrolls, and an
 * optional footer for the form's buttons. Square and flat, like every panel.
 */
export function VoucherDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  wide = false,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Long forms (voucher details) take 560px; everything else 440px. */
  wide?: boolean;
  bodyClassName?: string;
}) {
  const { t } = useLingui();
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent
          className={cn(
            "flex max-h-[85dvh] flex-col rounded-none border border-border bg-card p-0 shadow-none",
            wide ? "w-[560px] max-w-[560px]" : "w-[440px] max-w-[440px]",
          )}
        >
          <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
            <DialogTitle className="min-w-0 truncate">{title}</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t`Close`}
              onClick={() => onOpenChange(false)}
            >
              <RiCloseLine aria-hidden="true" />
            </Button>
          </div>
          <div
            className={cn(
              "grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 justify-end gap-2 border-border border-t p-4">
              {footer}
            </div>
          ) : null}
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
