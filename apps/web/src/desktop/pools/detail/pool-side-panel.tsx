import type { PoolVoucher } from "@clc/api/features/pools/client";
import { useLingui } from "@lingui/react/macro";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";

/** What the pool page's side column shows in place of the swap. */
export type PoolSide =
  | { kind: "details" }
  | { kind: "liquidity" }
  | { kind: "fees" }
  | { kind: "feeSettings" }
  | { kind: "ownership" }
  | { kind: "retirement" }
  | { kind: "approve" }
  | { kind: "voucher"; voucher: PoolVoucher }
  | { kind: "activity"; entry: PoolActivityEntry }
  /** The URL names an activity row that has not loaded, or is not in the feed. */
  | { kind: "activityMissing"; loading: boolean };

/** Whether any part of the panel is inside the window. */
function isOnScreen(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/**
 * The side column as an inspector: a 52px header with Close, a body that
 * scrolls inside the viewport (the column is sticky, so a taller panel would
 * otherwise hide its own footer), and an optional footer for the actions.
 *
 * It behaves as `DeskInspector` does. `focus` says how it takes focus on
 * open: `"always"` for a form or a tool, which the person opened to use, and
 * `"offscreen"` for a detail they browse beside a list, which keeps focus on
 * the list (so J/K keep working) unless the page stacks it out of view. Focus
 * goes back to where it was when the panel closes. Escape closes it only when
 * nothing inside it (a menu, a popover) has claimed the key.
 */
export function PoolSidePanel({
  title,
  onClose,
  onSubmit,
  footer,
  focus = "always",
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** Makes the panel a form, so Enter submits and the footer's submit button works. */
  onSubmit?: () => void;
  footer?: ReactNode;
  focus?: "always" | "offscreen";
  children: ReactNode;
}) {
  const { t } = useLingui();
  const titleId = useId();
  const panel = useRef<HTMLFormElement>(null);

  // Once per opening: the panel is keyed by what it shows.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const enter = focus === "always" || !isOnScreen(element);
    if (enter) element.focus();
    return () => {
      if (!enter) return;
      // Give focus back only when closing left it nowhere; a click elsewhere keeps it.
      const rest = document.activeElement;
      if (opener?.isConnected && (!rest || rest === document.body)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.stopPropagation();
    onClose();
  };

  const content = (
    <>
      <div className="flex min-h-13 shrink-0 items-center justify-between gap-3 border-border border-b py-2 ps-4 pe-2">
        <SectionHeading
          as="h2"
          variant="section"
          id={titleId}
          className="min-w-0 [overflow-wrap:anywhere]"
        >
          {title}
        </SectionHeading>
        <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">{children}</div>
      {footer ? (
        <div className="grid shrink-0 gap-2 border-border border-t p-4">{footer}</div>
      ) : null}
    </>
  );
  const className =
    "flex max-h-[calc(100dvh-7.5rem)] min-h-0 min-w-0 flex-col border border-border bg-card outline-none";
  return onSubmit ? (
    <form
      ref={panel}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-desk-inspector=""
      className={className}
      onKeyDown={onKeyDown}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {content}
    </form>
  ) : (
    <section
      ref={panel}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-desk-inspector=""
      className={className}
      onKeyDown={onKeyDown}
    >
      {content}
    </section>
  );
}
