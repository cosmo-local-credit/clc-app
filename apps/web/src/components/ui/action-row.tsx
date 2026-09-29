import type { ReactNode } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

import { cn } from "#/lib/utils";

/**
 * One tappable row inside a settings group — an icon, what it does, and a
 * chevron into the sheet that does it.
 *
 * Grouped rows rather than a stack of full-width buttons: a steward's controls
 * are all the same class of action, and the label already says what each one is,
 * so a heading and a sentence explaining the group only push the controls down
 * the screen.
 *
 * `last:` rather than a prop for the closing rule, because which row ends a
 * group depends on what the reader is allowed to do.
 */
export function ActionRow({
  icon,
  label,
  value,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  /** A figure or address the row is currently set to, shown against the label. */
  value?: string;
  /**
   * `destructive` colours the icon and label for a row that takes something
   * away. Colour rather than a separate block: the row still belongs with the
   * other controls, and pulling it into its own titled group would say the
   * action is more dangerous than it is — nothing here is unrecoverable.
   */
  tone?: "default" | "destructive";
  onClick: () => void;
}) {
  const destructive = tone === "destructive";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 border-b border-border p-3 text-start last:border-b-0"
    >
      <span className={destructive ? "text-destructive" : "text-muted-foreground"}>{icon}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-sm",
          destructive && "text-destructive",
        )}
      >
        {label}
      </span>
      {value ? (
        <span className="shrink-0 font-mono text-muted-foreground text-xs">{value}</span>
      ) : null}
      <RiArrowRightSLine
        className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
