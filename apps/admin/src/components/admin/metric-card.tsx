import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatCount } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { cn } from "#/lib/utils";

export type MetricTone = "neutral" | "success" | "warning" | "danger" | "muted";

const valueClass: Record<MetricTone, string> = {
  neutral: "text-foreground",
  success: "text-state-active",
  warning: "text-state-pending",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

const iconShellClass: Record<MetricTone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-state-active/25 bg-state-active/10 text-state-active",
  warning: "border-state-pending/25 bg-state-pending/10 text-state-pending",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

/**
 * The list routes validate search params, so a link must name one. Metric tiles
 * always land on the default first page rather than inheriting whatever view the
 * operator last had.
 */
type MetricLink = { to: "/pools" | "/vouchers" | "/users" | "/transactions/vouchers" };

export function MetricCard({
  label,
  value,
  tone = "neutral",
  size = "default",
  link,
  icon,
  detail,
  unavailable = false,
  className,
}: {
  label: string;
  value: number | string;
  tone?: MetricTone;
  /**
   * `sm` is the same tile at detail-screen density: it sits in a column beside
   * other panels rather than in a full-width dashboard row, so it drops the
   * minimum height and takes a step down the type scale. The dashboard keeps the
   * default.
   */
  size?: "default" | "sm";
  link?: MetricLink;
  icon?: ReactNode;
  /** Optional secondary line under the value. */
  detail?: string;
  /**
   * The figure could not be obtained. Renders an em-dash and "unavailable"
   * instead of `value`, because a failed request must never be shown as a real
   * number — least of all as zero, which reads as a healthy empty backend.
   */
  unavailable?: boolean;
  className?: string;
}) {
  const compact = size === "sm";
  const effectiveTone = unavailable ? "muted" : tone;
  const display = unavailable ? "—" : typeof value === "number" ? formatCount(value) : value;
  const effectiveDetail = unavailable ? "unavailable" : detail;

  const body = (
    <div
      className={cn(
        "border-border bg-card text-card-foreground relative flex h-full items-start justify-between gap-3 border transition-colors",
        compact ? "min-h-0 p-3" : "min-h-24 p-4",
        link && "hover:bg-accent/60",
        className,
      )}
    >
      <div className={cn("min-w-0", compact ? "space-y-1" : "space-y-2")}>
        <div
          className={cn(
            "text-muted-foreground font-mono font-medium uppercase",
            // Tighter tracking at the small size: "Pool memberships" has to fit a
            // column, and 0.14em is what pushes it onto a third line.
            compact ? "text-[0.625rem] tracking-[0.08em]" : "text-xs tracking-[0.14em]",
          )}
        >
          {label}
        </div>
        <div className="space-y-0.5">
          <div
            className={cn(
              "font-mono font-semibold tracking-tight tabular-nums",
              compact ? "text-lg" : "text-2xl",
              valueClass[effectiveTone],
            )}
          >
            {display}
          </div>
          {effectiveDetail ? (
            <div
              className={cn(
                "font-mono tabular-nums",
                compact ? "text-[0.625rem]" : "text-xs",
                effectiveTone === "danger" || effectiveTone === "warning"
                  ? valueClass[effectiveTone]
                  : "text-muted-foreground",
              )}
            >
              {effectiveDetail}
            </div>
          ) : null}
        </div>
      </div>
      {icon ? (
        <div
          className={cn(
            "shrink-0 border",
            compact ? "p-2 [&_svg]:size-4" : "p-2.5 [&_svg]:size-5",
            iconShellClass[effectiveTone],
          )}
        >
          {icon}
        </div>
      ) : null}
    </div>
  );

  if (!link) return body;

  return (
    <Link
      to={link.to}
      search={{ perPage: DEFAULT_PAGE_SIZE }}
      className="focus-visible:ring-ring block h-full outline-none focus-visible:ring-1"
    >
      {body}
    </Link>
  );
}
