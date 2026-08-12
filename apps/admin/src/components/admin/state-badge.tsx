import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

/**
 * Entity status chip. Lyra-aligned: monochrome base with one restrained accent
 * per state, square corners, mono uppercase label.
 *
 * `state` accepts the raw backend value; unknown values render as a neutral chip
 * with the value itself as the label rather than being silently dropped.
 */
type StateTone = {
  label: string;
  className: string;
  pulse?: boolean;
};

const NEUTRAL = "border-border bg-muted text-muted-foreground";

const stateTones: Record<string, StateTone> = {
  active: {
    label: "active",
    className: "border-state-active/30 bg-state-active/10 text-state-active",
  },
  inactive: {
    label: "inactive",
    className: NEUTRAL,
  },
  allowed: {
    label: "allowed",
    className: "border-state-active/30 bg-state-active/10 text-state-active",
  },
  blocked: {
    label: "blocked",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  internal: {
    label: "internal",
    className: "border-foreground/20 bg-foreground/5 text-foreground",
  },
  // OTX lifecycle, as clc-core reports it.
  // Account approval, as clc-core reports it. PENDING is shared with the OTX
  // lifecycle below — same word, same meaning: awaiting an outcome.
  APPROVED: {
    label: "approved",
    className: "border-state-active/30 bg-state-active/10 text-state-active",
  },
  REJECTED: {
    label: "rejected",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  SUCCESS: {
    label: "success",
    className: "border-state-active/30 bg-state-active/10 text-state-active",
  },
  PENDING: {
    label: "pending",
    className: "border-state-pending/30 bg-state-pending/10 text-state-pending",
    pulse: true,
  },
  IN_NETWORK: {
    label: "in network",
    className: "border-foreground/20 bg-foreground/5 text-foreground",
    pulse: true,
  },
  REVERTED: {
    label: "reverted",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  FAIL: {
    label: "failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function StateBadge({
  state,
  kind,
  className,
}: {
  state: string;
  /** What the state describes, for the accessible label ("pool", "voucher"…). */
  kind: string;
  className?: string;
}) {
  const tone = stateTones[state] ?? { label: state.toLowerCase(), className: NEUTRAL };

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono text-xs font-medium tracking-wide uppercase",
        tone.className,
        className,
      )}
      aria-label={`${kind} state ${tone.label}`}
    >
      <span className={cn("size-1.5 bg-current", tone.pulse && "animate-pulse")} />
      {tone.label}
    </Badge>
  );
}
