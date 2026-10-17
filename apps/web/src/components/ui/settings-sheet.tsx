import type { ReactNode } from "react";
import { RiErrorWarningLine } from "react-icons/ri";

import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { cn } from "#/lib/utils";

/**
 * The sheet a settings row opens: a title over the row's detail, with the
 * row's actions in a footer.
 *
 * The portal renders nothing while the sheet is closed, so a page of rows
 * each owning one costs a closed Drawer root apiece, not a hidden sheet.
 */
export function SettingsSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {children ? (
            <div
              className={cn(
                "min-h-0 flex-1 space-y-3 overflow-y-auto px-4",
                footer ? "pb-2" : "pb-6",
              )}
            >
              {children}
            </div>
          ) : null}
          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

/** An error inside a settings sheet, above whatever retries it. */
export function SettingsSheetAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-destructive text-sm">
      <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
