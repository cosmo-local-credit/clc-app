import { HiOutlineClipboard, HiOutlineClipboardCheck } from "react-icons/hi";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(className)}
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
        <HiOutlineClipboardCheck className="size-3.5" />
      ) : (
        <HiOutlineClipboard className="size-3.5" />
      )}
    </Button>
  );
}
