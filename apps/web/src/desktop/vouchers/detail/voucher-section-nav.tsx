import { useLingui } from "@lingui/react/macro";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { cn } from "#/lib/utils";

const SECTION_IDS = ["offerings", "reviews", "posts", "activity"] as const;
type VoucherSectionId = (typeof SECTION_IDS)[number];
type SectionCounts = Partial<Record<VoucherSectionId, number>>;
type ReportCount = (count: number | undefined) => void;

/**
 * How far under the top of the scrolling canvas a section's heading lands, and
 * so how far it must have risen to count as the section being read. The nav
 * is about 42px tall; the rest is air. `scroll-mt-14` on a region and on a
 * focused control (56px) keeps both clear of the sticky nav.
 */
const ACTIVE_LINE = 72;

function regionId(id: VoucherSectionId) {
  return `voucher-section-${id}`;
}

function useSectionLabels(): Record<VoucherSectionId, string> {
  const { t } = useLingui();
  return { offerings: t`Offerings`, reviews: t`Reviews`, posts: t`Posts`, activity: t`Activity` };
}

/**
 * The counts the four sections have reported. A section reports a number only
 * when the whole list has loaded (see `useReportSectionCount`), so a count in
 * the nav is never the size of a first page.
 */
export function useVoucherSectionCounts() {
  const [counts, setCounts] = useState<SectionCounts>({});
  const report = useMemo(() => {
    const entries = SECTION_IDS.map((id) => {
      const set: ReportCount = (count) =>
        setCounts((current) => (current[id] === count ? current : { ...current, [id]: count }));
      return [id, set] as const;
    });
    return Object.fromEntries(entries) as Record<VoucherSectionId, ReportCount>;
  }, []);
  return { counts, report };
}

function scrollParent(element: Element): Element {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** The last section whose heading has risen past the line under the sticky nav. */
function useActiveSection() {
  const [active, setActive] = useState<VoucherSectionId | null>(null);
  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const first = document.getElementById(regionId(SECTION_IDS[0]));
        if (!first) return;
        const scroller = scrollParent(first);
        const top =
          scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
        // At the end of the page the last section may never reach the line.
        const atEnd =
          scroller.scrollTop > 0 &&
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        let current: VoucherSectionId | null = atEnd ? SECTION_IDS[SECTION_IDS.length - 1] : null;
        if (!atEnd) {
          for (const id of SECTION_IDS) {
            const element = document.getElementById(regionId(id));
            if (element && element.getBoundingClientRect().top <= top + ACTIVE_LINE) current = id;
          }
        }
        setActive(current);
      });
    };
    update();
    // The canvas scrolls, not the window; capture sees every scroller.
    document.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, []);
  return [active, setActive] as const;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * A compact row for the long voucher page: Offerings, Reviews, Posts and
 * Activity, each with its count once that is known. It sticks under the top
 * bar while the page scrolls (the page's one scroller, no nested ones). A
 * section scrolls into view and takes focus, so a keyboard or screen-reader
 * user lands in it; the one being read is marked `aria-current="location"`.
 */
export function VoucherSectionNav({ counts }: { counts: SectionCounts }) {
  const { t } = useLingui();
  const labels = useSectionLabels();
  const [active, setActive] = useActiveSection();

  function go(event: ReactMouseEvent<HTMLAnchorElement>, id: VoucherSectionId) {
    const region = document.getElementById(regionId(id));
    if (!region) return;
    event.preventDefault();
    region.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    region.focus({ preventScroll: true });
    setActive(id);
  }

  return (
    <nav
      aria-label={t`Voucher sections`}
      className="sticky top-0 z-10 flex min-w-0 items-end overflow-x-auto border-border border-b bg-background [scrollbar-width:none]"
    >
      {SECTION_IDS.map((id) => {
        const count = counts[id];
        const current = active === id;
        return (
          <a
            key={id}
            href={`#${regionId(id)}`}
            aria-current={current ? "location" : undefined}
            onClick={(event) => go(event, id)}
            className={cn(
              "-mb-px flex shrink-0 items-baseline gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground",
              current
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[id]}
            {count === undefined ? null : (
              <>
                {" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
              </>
            )}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * One section of the page: a named region the nav scrolls to and focuses. The
 * section keeps its own heading; this only gives it an address.
 */
export function VoucherSectionRegion({
  id,
  children,
}: {
  id: VoucherSectionId;
  children: ReactNode;
}) {
  const labels = useSectionLabels();
  return (
    <div
      id={regionId(id)}
      role="region"
      aria-label={labels[id]}
      tabIndex={-1}
      className="min-w-0 scroll-mt-14 outline-none"
    >
      {children}
    </div>
  );
}
