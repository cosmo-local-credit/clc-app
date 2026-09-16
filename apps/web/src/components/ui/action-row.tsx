import type { ReactNode } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

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
  onClick,
}: {
  icon: ReactNode;
  label: string;
  /** A figure or address the row is currently set to, shown against the label. */
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 border-b border-border p-3 text-left last:border-b-0"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-sm">{label}</span>
      {value ? (
        <span className="shrink-0 font-mono text-muted-foreground text-xs">{value}</span>
      ) : null}
      <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
