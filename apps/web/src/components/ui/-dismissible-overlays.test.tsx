import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConfirmDialog } from "./confirm-dialog";
import { DialogBackdrop, DialogContent, DialogPortal, DialogRoot, DialogTitle } from "./dialog";
import { SheetBackdrop, SheetContent, SheetPortal, SheetRoot, SheetTitle } from "./sheet";

describe("shared dismissible overlays", () => {
  it("gives dialogs a visible close action", () => {
    const onOpenChange = vi.fn();
    render(
      <DialogRoot open onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent>
            <DialogTitle>Confirm action</DialogTitle>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>,
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toContain("end-2");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("can suppress a dialog's shared close action when it has a specialized one", () => {
    render(
      <DialogRoot open>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent showCloseButton={false}>
            <DialogTitle>Image preview</DialogTitle>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("gives sheets a visible close action and disables it during protected work", () => {
    const onOpenChange = vi.fn();
    render(
      <SheetRoot open onOpenChange={onOpenChange}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent closeButtonDisabled>
            <SheetTitle>Review swap</SheetTitle>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>,
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.hasAttribute("disabled")).toBe(true);
    fireEvent.click(close);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("dismisses idle confirmations while protecting pending work", () => {
    const onCancel = vi.fn();
    const props = {
      open: true,
      title: "Delete catalog?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      onConfirm: vi.fn(),
      onCancel,
    };
    const idle = render(<ConfirmDialog {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    idle.unmount();

    render(<ConfirmDialog {...props} pending pendingLabel="Deleting…" />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
