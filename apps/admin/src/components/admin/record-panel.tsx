import type { ReactNode } from "react";

import type { DataState } from "#/lib/data-state";
import { cn } from "#/lib/utils";

/**
 * A record tab's body, and its one padding rule.
 *
 * A table fills the panel edge to edge — its header row reads as the panel's own
 * top rule — while the loading block, error and empty state `SectionState`
 * renders instead are inset so they do not sit flush against the frame. The
 * `stale` case is the only one that renders both, so the notice above the rows is
 * inset on its own.
 *
 * Every detail screen's tabs share this because the alternative is each deciding
 * its own inset, and a table that starts four pixels inside its frame on one tab
 * and flush on the next reads as a rendering bug.
 */
export function RecordPanel({
  state,
  content = "table",
  children,
}: {
  state: DataState;
  /**
   * What fills the panel when the request succeeded. `table` goes edge to edge;
   * `grid` — a card grid, the offerings tab — needs the inset in every state,
   * and takes the stale notice inside that padding rather than beside it.
   */
  content?: "table" | "grid";
  children: ReactNode;
}) {
  if (content === "grid") return <div className="p-4">{children}</div>;

  return (
    <div
      className={cn(
        state.kind !== "ready" && state.kind !== "stale" && "p-4",
        "[&>[data-slot=alert]]:m-4",
      )}
    >
      {children}
    </div>
  );
}
