import { RiFileCopyLine } from "react-icons/ri";

import { EllipsizedAddress } from "#/components/wallet";

export function CopyableInfoValue({
  value,
  label,
  onCopy,
}: {
  value: string;
  label: string;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-1.5 bg-card text-end"
      aria-label={label}
      onClick={() => onCopy(value)}
    >
      <EllipsizedAddress address={value} />
      <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3" aria-hidden="true" />
      </span>
    </button>
  );
}
