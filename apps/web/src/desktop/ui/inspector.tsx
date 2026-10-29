import { useLingui } from "@lingui/react/macro";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/**
 * A 380px inspector docks beside the main pane only while that pane keeps 560px
 * or more. Narrower, the inspector overlays the pane as a dialog and the pane
 * goes inert, so nothing is crushed and nothing behind it stays clickable.
 */
const DOCK_MIN_WIDTH = 560 + 380;

const SplitContext = createContext({ overlay: false });

/**
 * The 380px column. The page owns what it shows.
 *
 * Two behaviours, chosen by the page, not by the panel:
 * - Non-modal (docked): the pane beside it stays usable for browsing and
 *   comparing. Focus is not moved, so J/K row traversal keeps working.
 * - Modal (overlaid, or `dimmed` on `DeskSplit`): focus enters the panel on
 *   open and returns to the control that opened it on close.
 *
 * Escape closes the panel only when nothing inside it (a menu, a popover) has
 * claimed the key first.
 */
export function DeskInspector({
  title,
  children,
  onClose,
  footer,
  focusOnOpen,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  /** Move focus into the panel on open and restore it on close. Defaults to on while overlaid. */
  focusOnOpen?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const { overlay } = useContext(SplitContext);
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const takeFocus = focusOnOpen ?? overlay;

  useEffect(() => {
    if (!takeFocus) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    return () => {
      // Give focus back only when closing left it nowhere; a click elsewhere keeps it.
      const rest = document.activeElement;
      if (opener?.isConnected && (!rest || rest === document.body)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [takeFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !onClose || event.defaultPrevented) return;
    event.stopPropagation();
    onClose();
  };

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role={overlay ? "dialog" : "complementary"}
      aria-labelledby={titleId}
      data-desk-inspector=""
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-h-0 w-[380px] max-w-full shrink-0 flex-col border-border border-s bg-card outline-none",
        className,
      )}
    >
      <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
        <h2 id={titleId} className="font-heading text-base font-semibold">
          {title}
        </h2>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
            <RiCloseLine />
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">{children}</div>
      {footer ? <div className="border-border border-t p-4">{footer}</div> : null}
    </aside>
  );
}

/**
 * The main pane and the column beside it. The pane is a size container, so
 * its pages adapt to the room they actually have. `dimmed` makes the pane
 * inert for a modal side; a side that cannot dock overlays the pane
 * on its own, and `onDismiss` lets a click on the scrim close it.
 */
export function DeskSplit({
  main,
  side,
  dimmed = false,
  onDismiss,
}: {
  main: ReactNode;
  side: ReactNode;
  dimmed?: boolean;
  onDismiss?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const hasSide = side != null && side !== false;

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    // A width of 0 means not laid out (hidden, or jsdom): keep the docked layout.
    const measure = () => {
      const width = element.clientWidth;
      setNarrow(width > 0 && width < DOCK_MIN_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const overlay = hasSide && narrow;
  const blocked = dimmed || overlay;

  return (
    <SplitContext.Provider value={{ overlay }}>
      <div ref={frame} className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "@container min-w-0 flex-1 overflow-y-auto",
            blocked && "pointer-events-none opacity-40",
          )}
          inert={blocked || undefined}
        >
          {main}
        </div>
        {overlay && onDismiss ? (
          <div aria-hidden="true" className="absolute inset-0 z-10" onClick={onDismiss} />
        ) : null}
        {hasSide ? (
          <div
            className={cn("flex min-h-0", overlay && "absolute inset-y-0 end-0 z-20 max-w-full")}
          >
            {side}
          </div>
        ) : null}
      </div>
    </SplitContext.Provider>
  );
}
