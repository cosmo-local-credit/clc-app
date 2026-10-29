import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("cancels when the dialog close control is used", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirm action"
        description="Review the consequence."
        confirmLabel="Continue"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
