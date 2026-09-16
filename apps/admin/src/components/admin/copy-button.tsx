import { useState } from "react";
import { RiCheckLine, RiFileCopyLine } from "react-icons/ri";
import { copyText } from "@/lib/copy";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={cn(
        "text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center outline-none",
        "hover:text-foreground focus-visible:ring-ring focus-visible:ring-1",
        className,
      )}
      aria-label={label}
      onClick={() => {
        void copyText(value, label).then((ok) => {
          if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }
        });
      }}
    >
      {copied ? (
        <RiCheckLine className="size-3" aria-hidden="true" />
      ) : (
        <RiFileCopyLine className="size-3" aria-hidden="true" />
      )}
    </button>
  );
}
