import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

/**
 * A transaction category, distinct from its outcome.
 *
 * Types are deliberately neutral: their purpose is to make a dense table
 * scannable without competing with the status badge's success, pending, and
 * failure tones. The raw API enums are normalized for people while the full
 * value remains available through the accessible label.
 */
export function TransactionTypeBadge({
  type,
  kind,
  className,
}: {
  type: string;
  /** What the type describes, for the accessible label ("voucher transaction" …). */
  kind: string;
  className?: string;
}) {
  const label = type.toLowerCase().replaceAll("_", " ");

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border bg-muted font-mono text-xs font-medium tracking-wide uppercase",
        className,
      )}
      aria-label={`${kind} type ${label}`}
    >
      {label}
    </Badge>
  );
}
