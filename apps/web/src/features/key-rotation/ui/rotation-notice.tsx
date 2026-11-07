import type { ReactNode } from "react";
import { RiErrorWarningLine } from "react-icons/ri";

/** A warning that guards the irreversible step it sits beside. */
export function RotationNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 border border-border bg-card p-3 text-sm">
      <RiErrorWarningLine
        className="mt-0.5 size-4 shrink-0 text-warning-foreground"
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}
