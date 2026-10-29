import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { EllipsizedAddress, HighlightAddress } from "#/components/wallet";
import { deskSectionLinkClass } from "#/desktop/ui/page";
import { cn } from "#/lib/utils";

/** Copies the exact value and says so; the messages are the caller's own words. */
export function copyValue(value: string, copied: string, failed: string) {
  if (!navigator.clipboard) {
    toast.error(failed);
    return;
  }
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(copied))
    .catch(() => toast.error(failed));
}

/** An address or a transaction hash: the head and tail are what people compare. */
const HEX = /^0x[0-9a-fA-F]{8,}$/;

/** `abcd1234…89abcd`, for an identifier that is not hex. */
function shorten(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

const LINK_BUTTON = cn(
  deskSectionLinkClass(),
  "font-sans outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
);

/**
 * An address, hash or ID that a person is verifying, not browsing. It reads
 * short; "Show full" lays out every character (wrapped, never cut); Copy
 * always takes the exact value. Both are buttons, so neither waits on a hover
 * and a keyboard or touch screen gets both. Hex values mark their head and
 * tail, the part people compare.
 *
 * Pass `onCopy` to own the copy, or `copiedMessage` and `failedMessage` to
 * have it done and announced.
 */
export function FullValue({
  value,
  copyLabel,
  onCopy,
  copiedMessage,
  failedMessage,
  initiallyFull = false,
  className,
}: {
  value: string;
  /** The accessible name of the copy button: "Copy transaction hash". */
  copyLabel: string;
  onCopy?: (value: string) => void;
  copiedMessage?: string;
  failedMessage?: string;
  /** Start with the whole value showing, as a confirmation step does. */
  initiallyFull?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const [full, setFull] = useState(initiallyFull);
  const hex = HEX.test(value);

  const copy = () => {
    if (onCopy) onCopy(value);
    else copyValue(value, copiedMessage ?? t`Copied`, failedMessage ?? t`Couldn't copy`);
  };

  return (
    <span className={cn("grid min-w-0 justify-items-start gap-1", className)}>
      {full ? (
        hex ? (
          <HighlightAddress address={value} tailLength={5} className="font-medium" />
        ) : (
          <span dir="ltr" className="min-w-0 font-mono [overflow-wrap:anywhere]">
            {value}
          </span>
        )
      ) : hex ? (
        <EllipsizedAddress address={value} />
      ) : (
        <span dir="ltr" className="min-w-0 font-mono">
          {shorten(value)}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={full}
          className={LINK_BUTTON}
          onClick={() => setFull((current) => !current)}
        >
          {full ? t`Hide full` : t`Show full`}
        </button>
        <button
          type="button"
          aria-label={copyLabel}
          className={cn(LINK_BUTTON, "inline-flex items-center gap-1")}
          onClick={copy}
        >
          <RiFileCopyLine className="size-3" aria-hidden="true" />
          {t`Copy`}
        </button>
      </span>
    </span>
  );
}
