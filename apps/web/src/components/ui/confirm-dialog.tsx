import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";

/** A shared, square confirmation dialog for phone and desktop web surfaces. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  pendingLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  pending?: boolean;
  pendingLabel?: ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="w-[min(22rem,calc(100vw-2rem))] rounded-none border border-border bg-card p-5 shadow-none">
          <DialogTitle>{title}</DialogTitle>
          <div className="mt-2 text-muted-foreground text-sm leading-6">{description}</div>
          <div className="mt-5 space-y-2">
            <Button
              type="button"
              tap
              className="w-full"
              variant={destructive ? "destructive" : "default"}
              pending={pending}
              onClick={onConfirm}
            >
              {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              tap
              className="w-full"
              disabled={pending}
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
