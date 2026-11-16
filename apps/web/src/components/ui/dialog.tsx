import { Dialog } from "@base-ui/react/dialog";
import { useLingui } from "@lingui/react/macro";
import type * as React from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils.ts";

export const DialogRoot = Dialog.Root;
export const DialogPortal = Dialog.Portal;
export const DialogClose = Dialog.Close;

/** Every dialog title is the 16px section heading, as sheet titles are. */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("pe-10 font-heading text-base font-semibold", className)}
      {...props}
    />
  );
}

function DialogBackdrop({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Dialog.Backdrop
      className={cn(
        "fixed inset-0 z-40 min-h-dvh bg-black/50 transition-opacity duration-150",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        "supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = React.ComponentProps<typeof Dialog.Popup> & {
  showCloseButton?: boolean;
  closeButtonDisabled?: boolean;
  closeButtonLabel?: string;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeButtonDisabled = false,
  closeButtonLabel,
  ...props
}: DialogContentProps) {
  const { t } = useLingui();
  return (
    <Dialog.Popup
      className={cn(
        "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-3rem)] max-w-sm",
        "-translate-x-1/2 -translate-y-1/2",
        "rounded-xl bg-background p-6",
        "border border-border shadow-xl",
        "transition-all duration-150",
        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
        "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <Dialog.Close
          disabled={closeButtonDisabled}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tap
              aria-label={closeButtonLabel ?? t`Close`}
              title={closeButtonLabel ?? t`Close`}
              className="absolute top-2 end-2 z-10"
            >
              <RiCloseLine aria-hidden="true" />
            </Button>
          }
        />
      ) : null}
    </Dialog.Popup>
  );
}

export { DialogBackdrop, DialogContent, DialogTitle };
