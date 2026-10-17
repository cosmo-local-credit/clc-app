import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";

/**
 * A two-button confirmation over the existing Dialog primitives.
 *
 * No Alert Dialog primitive is added for this: the same shape already backs the
 * offering unlist confirmation, and a second dialog family would be a second
 * visual language for the same question.
 */
export function PostConfirmDialog({
  open,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { t } = useLingui();

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="w-[min(22rem,calc(100vw-2rem))] rounded-none border border-border bg-card p-5 shadow-none">
          <DialogTitle className="font-heading text-base font-semibold leading-snug">
            {title}
          </DialogTitle>
          <div className="mt-2 text-muted-foreground text-sm leading-6">{children}</div>
          <div className="mt-5 space-y-2">
            <Button type="button" size="lg" className="w-full" onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button type="button" variant="outline" size="lg" className="w-full" onClick={onCancel}>
              {t`Cancel`}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
