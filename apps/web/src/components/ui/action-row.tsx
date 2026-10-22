import { cloneElement, type ReactElement, type ReactNode } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils";

/**
 * One row inside a settings group — an icon, what it is, what it is set to,
 * and a chevron into the sheet or screen that changes it.
 *
 * Grouped rows rather than a stack of full-width buttons: a steward's controls
 * are all the same class of action, and the label already says what each one is,
 * so a heading and a sentence explaining the group only push the controls down
 * the screen.
 *
 * Every row is exactly 44px on one line, its rule included, so a group keeps
 * one pitch whatever its rows say. `last:` rather than a prop for the closing
 * rule, because which row ends a group depends on what the reader is allowed
 * to do.
 *
 * A row with neither `onClick` nor `render` has nothing behind it, so it is
 * static and drops the chevron: tapping it would do nothing.
 *
 * `busy` puts the Spinner in the icon slot while the row's action is under
 * way, marks the row `aria-busy` and disables a button row so it cannot be
 * started twice. The row keeps its place and its chevron; pass the in-progress
 * label ("Signing out…") alongside.
 */
export function ActionRow({
  icon,
  label,
  value,
  valueTone = "default",
  tone = "default",
  trailingIcon,
  busy = false,
  id,
  ariaLabel,
  pressed,
  className,
  onClick,
  render,
}: {
  icon: ReactNode;
  label: string;
  /** What the row is currently set to, shown against the label. */
  value?: ReactNode;
  /** `primary` marks a value that reads as done or on ("Linked", "On", "Active"). */
  valueTone?: "default" | "primary";
  /**
   * `destructive` colours the icon and label for a row that takes something
   * away. Colour rather than a separate block: the row still belongs with the
   * other controls, and pulling it into its own titled group would say the
   * action is more dangerous than it is.
   */
  tone?: "default" | "destructive";
  /** Replaces the chevron, e.g. with an external-link glyph. */
  trailingIcon?: ReactNode;
  busy?: boolean;
  id?: string;
  ariaLabel?: string;
  pressed?: boolean;
  className?: string;
  onClick?: () => void;
  /** Navigates instead of acting: the `<a>` or router `<Link>` the row renders as. */
  render?: ReactElement<{ id?: string; className?: string; children?: ReactNode }>;
}) {
  const destructive = tone === "destructive";
  const interactive = onClick !== undefined || render !== undefined;
  const classes = cn(
    "flex h-11 w-full items-center gap-3 border-b border-border px-3 text-start last:border-b-0",
    interactive &&
      "outline-none active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
    className,
  );
  const content = (
    <>
      <span className={cn("shrink-0", destructive ? "text-destructive" : "text-muted-foreground")}>
        {busy ? <Spinner /> : icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-sm",
          destructive && "text-destructive",
        )}
      >
        {label}
      </span>
      {value ? (
        <span
          className={cn(
            "min-w-0 max-w-[55%] truncate font-medium text-xs",
            valueTone === "primary" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {value}
        </span>
      ) : null}
      {interactive && trailingIcon !== false ? (
        <span className="shrink-0 text-muted-foreground" aria-hidden="true">
          {trailingIcon ?? <RiArrowRightSLine className="rtl:-scale-x-100 size-4" />}
        </span>
      ) : null}
    </>
  );

  const busyProps = busy ? { "aria-busy": true } : {};
  if (render) {
    return cloneElement(render, {
      id,
      ...busyProps,
      className: cn(classes, render.props.className),
      children: content,
    });
  }
  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        onClick={onClick}
        disabled={busy}
        className={classes}
        {...busyProps}
      >
        {content}
      </button>
    );
  }
  return (
    <div id={id} className={classes} {...busyProps}>
      {content}
    </div>
  );
}
