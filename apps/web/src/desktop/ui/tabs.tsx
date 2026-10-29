import { useLingui } from "@lingui/react/macro";
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";

import { cn } from "#/lib/utils";

type TabsKind = "nav" | "tabs";

const TabsContext = createContext<{
  kind: TabsKind;
  scroller: RefObject<HTMLDivElement | null> | null;
}>({ kind: "nav", scroller: null });

/** Pixels of slack before a scroll edge counts as reached. */
const EDGE = 2;

/**
 * Underlined tabs in a row that scrolls sideways when it must. A chevron
 * appears at whichever end has more tabs, and the active tab is kept in view.
 *
 * `kind="nav"` (default) is route navigation: each tab is the caller's link,
 * the URL owns the selection and the active tab carries `aria-current`.
 * `kind="tabs"` is a local content switch with the tablist pattern: pass
 * `DeskTab`s with `id` and `controls`, render the panel in a `DeskTabPanel`,
 * and Left/Right/Home/End move between tabs.
 */
export function DeskTabs({
  children,
  label,
  kind = "nav",
  tight = false,
  className,
}: {
  children: ReactNode;
  label: string;
  kind?: TabsKind;
  /** The narrow results column and the place panel. */
  tight?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const offset = Math.abs(element.scrollLeft);
    const start = offset > EDGE;
    const end = offset + element.clientWidth < element.scrollWidth - EDGE;
    setMore((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  // A tab appearing or disappearing (a count arriving) changes the overflow.
  useEffect(() => {
    measure();
  }, [measure, children]);

  const page = (direction: "start" | "end") => {
    const element = scroller.current;
    if (!element) return;
    const rtl = getComputedStyle(element).direction === "rtl";
    const sign = (direction === "end" ? 1 : -1) * (rtl ? -1 : 1);
    element.scrollBy({ left: sign * element.clientWidth * 0.75 });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (kind !== "tabs") return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next = current;
    if (event.key === "ArrowRight") next = current + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = current + (rtl ? 1 : -1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    target?.focus();
    // Selection follows focus: these panels render without a fetch.
    target?.click();
  };

  const chevron = (direction: "start" | "end") => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={direction === "start" ? t`Show earlier tabs` : t`Show more tabs`}
      className="flex w-7 shrink-0 items-center justify-center border-border border-b text-muted-foreground hover:text-foreground"
      onClick={() => page(direction)}
    >
      {direction === "start" ? (
        <RiArrowLeftSLine className="rtl:rotate-180" aria-hidden="true" />
      ) : (
        <RiArrowRightSLine className="rtl:rotate-180" aria-hidden="true" />
      )}
    </button>
  );

  const strip = (
    <div
      ref={scroller}
      data-tight={tight ? "" : undefined}
      role={kind === "tabs" ? "tablist" : undefined}
      aria-label={kind === "tabs" ? label : undefined}
      onKeyDown={onKeyDown}
      className="group/tabs flex min-w-0 flex-1 items-end overflow-x-auto border-border border-b [scrollbar-width:none]"
    >
      <TabsContext.Provider value={{ kind, scroller }}>{children}</TabsContext.Provider>
    </div>
  );

  return (
    <div className={cn("flex min-w-0 items-stretch", className)}>
      {more.start ? chevron("start") : null}
      {kind === "nav" ? (
        <nav aria-label={label} className="flex min-w-0 flex-1">
          {strip}
        </nav>
      ) : (
        strip
      )}
      {more.end ? chevron("end") : null}
    </div>
  );
}

/**
 * Pass a `<Link>` (or a `<button>`) as the only child; it gets the tab look.
 * In `kind="tabs"`, give it the `id` its panel names and the panel's id as
 * `controls`. The child's own `ref` is replaced.
 */
export function DeskTab({
  active,
  id,
  controls,
  children,
}: {
  active: boolean;
  id?: string;
  controls?: string;
  children: ReactElement;
}) {
  const { kind, scroller } = useContext(TabsContext);
  const element = useRef<HTMLElement | null>(null);

  // Bring the active tab into the strip. Only the strip scrolls, never the page.
  useEffect(() => {
    const bar = scroller?.current;
    const tab = element.current;
    if (!active || !bar || !tab) return;
    const barBox = bar.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < barBox.left) bar.scrollBy({ left: tabBox.left - barBox.left });
    else if (tabBox.right > barBox.right) bar.scrollBy({ left: tabBox.right - barBox.right });
  }, [active, scroller]);

  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      element.current = node;
    },
    id,
    ...(kind === "tabs"
      ? {
          role: "tab",
          "aria-selected": active,
          "aria-controls": controls,
          tabIndex: active ? 0 : -1,
        }
      : { "aria-current": active ? "page" : undefined }),
    className: cn(
      "-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap group-data-tight/tabs:px-2.5",
      active
        ? "border-foreground font-semibold text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
      child.props.className as string | undefined,
    ),
  });
}

/** The panel a `kind="tabs"` tab controls. Render only the active one. */
export function DeskTabPanel({
  id,
  tabId,
  children,
  className,
}: {
  id: string;
  tabId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={tabId} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
