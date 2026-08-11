import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatCount } from "#/lib/format";
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

type MetricLink = { to: "/pools" } | { to: "/vouchers" } | { to: "/users" };

export function MetricCard({
  label,
  value,
  tone = "neutral",
  link,
  icon,
  detail,
  unavailable = false,
  className,
}: {
  label: string;
  value: number | string;
  tone?: MetricTone;
  link?: MetricLink;
  icon?: ReactNode;
  /** Optional secondary line under the value (e.g. that it is a page sample). */
  detail?: string;
  /**
   * The figure could not be obtained. Renders an em-dash and "unavailable"
   * instead of `value`, because a failed request must never be shown as a real
   * number — least of all as zero, which reads as a healthy empty backend.
   */
  unavailable?: boolean;
  className?: string;
}) {
  const effectiveTone = unavailable ? "muted" : tone;
  const display = unavailable ? "—" : typeof value === "number" ? formatCount(value) : value;
  const effectiveDetail = unavailable ? "unavailable" : detail;

  const body = (
    <div
      className={cn(
        "relative flex h-full min-h-24 items-start justify-between gap-3 border border-border bg-card p-4 text-card-foreground transition-colors",
        link && "hover:bg-accent/60",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <div className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </div>
        <div className="space-y-0.5">
          <div
            className={cn(
              "font-mono text-2xl font-semibold tracking-tight tabular-nums",
              valueClass[effectiveTone],
            )}
          >
            {display}
          </div>
          {effectiveDetail ? (
            <div
              className={cn(
                "font-mono text-xs tabular-nums",
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
        <div className={cn("shrink-0 border p-2.5 [&_svg]:size-5", iconShellClass[effectiveTone])}>
          {icon}
        </div>
      ) : null}
    </div>
  );

  if (!link) return body;

  return (
    <Link
      {...link}
      className="block h-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}
