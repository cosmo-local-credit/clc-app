import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
import { cn } from "#/lib/utils";

type WantPart = "want" | "when" | "where" | "picture" | "contact";

/** The editor's parts, in order: the outline links to each and each is headed with its name. */
const PARTS: { part: WantPart; label: ReactNode }[] = [
  { part: "want", label: <Trans>Want</Trans> },
  { part: "when", label: <Trans>When</Trans> },
  { part: "where", label: <Trans>Where</Trans> },
  { part: "picture", label: <Trans>Picture</Trans> },
  { part: "contact", label: <Trans>Contact</Trans> },
];
const OUTLINE = PARTS.map((entry) => ({ target: partId(entry.part), label: entry.label }));
const OUTLINE_TARGETS = OUTLINE.map((entry) => entry.target);

/** The id of a part's section, which the outline scrolls to. */
export function partId(part: WantPart) {
  return `want-part-${part}`;
}

/**
 * The name of one part of the form, as the heading its fields sit under: the
 * 16px section style, one level below the page title, the same word the
 * outline links with. The part's section takes `aria-labelledby` from `id`.
 */
export function WantPartHeading({ part }: { part: WantPart }) {
  const entry = PARTS.find((candidate) => candidate.part === part);
  return (
    <SectionHeading as="h2" variant="section" id={`${partId(part)}-heading`}>
      {entry?.label}
    </SectionHeading>
  );
}

/**
 * The editor's section links. Beside the form (from 43rem of canvas) they are a
 * sticky column with a start-edge marker; narrower, the same links are a wrapped
 * row above the form with an underline marker. Scrolling to a part is instant
 * for anyone who asked their system for reduced motion.
 */
export function WantOutline({ className }: { className?: string }) {
  const { t } = useLingui();
  const active = useActiveTarget(OUTLINE_TARGETS);
  return (
    <nav
      aria-label={t`Sections`}
      className={cn(
        "flex flex-wrap gap-x-1 border-border border-b",
        "@min-[43rem]:sticky @min-[43rem]:top-7 @min-[43rem]:grid @min-[43rem]:content-start @min-[43rem]:border-b-0",
        className,
      )}
    >
      {OUTLINE.map((entry) => (
        <a
          key={entry.target}
          href={`#${entry.target}`}
          aria-current={active === entry.target ? "location" : undefined}
          onClick={(event) => {
            const part = document.getElementById(entry.target);
            if (!part) return;
            event.preventDefault();
            part.scrollIntoView({
              block: "start",
              behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            });
          }}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium @min-[43rem]:border-b-0 @min-[43rem]:border-s-2",
            active === entry.target
              ? "border-primary bg-card font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}

/** The last outline entry whose part has scrolled into the top part of the viewport. */
function useActiveTarget(targets: readonly string[]) {
  const [active, setActive] = useState(targets[0]);
  useEffect(() => {
    let frame = 0;
    const update = (event?: Event) => {
      const scroller = event?.target instanceof Element ? event.target : null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // At the end of the page the last part may never reach the line.
        const atEnd =
          scroller !== null &&
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const line = atEnd ? window.innerHeight : window.innerHeight * 0.4;
        let current = targets[0];
        for (const target of targets) {
          const element = document.getElementById(target);
          if (element && element.getBoundingClientRect().top <= line) current = target;
        }
        setActive(current);
      });
    };
    update();
    // The canvas scrolls, not the window; capture sees every scroller.
    document.addEventListener("scroll", update, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", update, { capture: true });
    };
  }, [targets]);
  return active;
}
