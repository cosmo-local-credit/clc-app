import { RiFileCopyLine } from "react-icons/ri";

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
    <span className={cn("min-w-0 break-all font-mono text-muted-foreground text-xs", className)}>
      0x
      <span className="font-semibold text-primary">{head}</span>
      {mid}
      <span className="font-semibold text-primary">{tail}</span>
    </span>
  );
}

export function EllipsizedAddress({ address, className }: { address: string; className?: string }) {
  return (
    <span className={cn("font-mono text-muted-foreground text-xs", className)}>
      0x
      <span className="font-semibold text-primary">{address.slice(2, 6)}</span>…
      <span className="font-semibold text-primary">{address.slice(-6)}</span>
    </span>
  );
}

/** Shortened address label, e.g. `0x91Ab3f…d2E7`. */
export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

export function CopyableAddress({ address, className }: { address: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 border border-border bg-card p-3", className)}>
      <span className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{address}</span>
      <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3.5" aria-hidden="true" />
      </span>
    </div>
  );
}
