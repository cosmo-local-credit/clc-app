import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";

import { DeskCanvas } from "#/desktop/ui/page";
import { WantFormPage } from "#/features/wants/ui/want-form-page";
import { cn } from "#/lib/utils";

/** Each outline entry jumps to the first control of its part of the form. */
const OUTLINE: { target: string; label: ReactNode }[] = [
  { target: "want-name", label: <Trans>Want</Trans> },
  { target: "want-start", label: <Trans>When</Trans> },
  { target: "location-search", label: <Trans>Where</Trans> },
  { target: "want-contact", label: <Trans>Contact</Trans> },
];
const OUTLINE_TARGETS = OUTLINE.map((entry) => entry.target);

/**
 * The phone form laid out as `.form-foot`: every field takes a full row, and
 * Close, Delete and Save/Create share one end-aligned row under a rule. "Use
 * profile image" stays beside the picture, at the start.
 */
const FORM_CLASS = cn(
  "[&_form]:flex [&_form]:flex-wrap [&_form]:items-center [&_form]:justify-end",
  "[&_form]:gap-x-2 [&_form]:gap-y-5 [&_form]:space-y-0",
  "[&_form>*]:min-w-0 [&_form>*]:basis-full",
  "[&_form>button]:basis-auto [&_form>button:not(section~button)]:me-auto",
  "[&_form>section~button]:order-10 [&_form>section~button]:w-auto [&_form>section~button[type=submit]]:order-12",
  "[&_form]:after:order-9 [&_form]:after:basis-full [&_form]:after:border-border [&_form]:after:border-t",
);

/** New and edit share the phone form, with an outline beside it. */
export function WantFormDesk({ wantId }: { wantId?: string }) {
  const { t } = useLingui();
  const active = useActiveTarget(OUTLINE_TARGETS);
  return (
    <DeskCanvas width="read" className="grid-cols-[200px_minmax(0,520px)] items-start gap-8">
      <nav aria-label={t`Sections`} className="sticky top-7 grid content-start">
        {OUTLINE.map((entry) => (
          <a
            key={entry.target}
            href={`#${entry.target}`}
            aria-current={active === entry.target ? "location" : undefined}
            onClick={(event) => {
              const field = document.getElementById(entry.target);
              if (!field) return;
              event.preventDefault();
              field.scrollIntoView({ block: "center", behavior: "smooth" });
              field.focus({ preventScroll: true });
            }}
            className={cn(
              "border-s-2 px-3 py-2 text-sm font-medium",
              active === entry.target
                ? "border-primary bg-card font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </a>
        ))}
      </nav>
      <div className={cn("min-w-0", FORM_CLASS)}>
        <WantFormPage id={wantId} embedded />
      </div>
    </DeskCanvas>
  );
}

/** The last outline entry whose field has scrolled into the top part of the viewport. */
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
