import { cn } from "#/lib/utils";

/**
 * Renders a hex address with the head and tail bytes emphasised — mirrors
 * how block explorers highlight the checksummed portions.
 */
export function HighlightAddress({
  address,
  className,
  tailLength = 4,
}: {
  address: string;
  className?: string;
  tailLength?: number;
}) {
  const head = address.slice(2, 6);
  const tail = address.slice(-tailLength);
  const mid = address.slice(6, -tailLength);
  return (
    <span
      dir="ltr"
      className={cn("min-w-0 break-all font-mono text-muted-foreground text-xs", className)}
    >
      0x
      <span className="font-semibold text-primary">{head}</span>
      {mid}
      <span className="font-semibold text-primary">{tail}</span>
    </span>
  );
}

/** Single-line address: leading 4 and trailing 5 highlighted, the rest elided. */
export function EllipsizedAddress({ address, className }: { address: string; className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn("whitespace-nowrap font-mono text-muted-foreground text-xs", className)}
    >
      0x
      <span className="font-semibold text-primary">{address.slice(2, 6)}</span>…
      <span className="font-semibold text-primary">{address.slice(-5)}</span>
    </span>
  );
}
