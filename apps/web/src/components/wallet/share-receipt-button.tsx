import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";

/**
 * Shares a confirmed receipt as text plus a block-explorer link.
 *
 * Prefers the native share sheet and offers a fresh copy tap if it fails. The
 * link rides in `text` rather than `url` so the clipboard fallback and share
 * targets that drop `url` (some messengers) both still carry it.
 */
export function ShareReceiptButton({
  title,
  lines,
  url,
  className,
}: {
  title: string;
  lines: readonly string[];
  url: string | null;
  className?: string;
}) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);
  const text = [...lines, ...(url ? [url] : [])].join("\n");

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy receipt`);
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t`Receipt copied`))
      .catch(() => toast.error(t`Couldn't copy receipt`));
  };

  const share = async () => {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({ title, text });
    } catch (error) {
      // AbortError = user dismissed the sheet; not a failure worth surfacing.
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
      )
        return;
      // Sharing consumes user activation. WebKit needs a new tap to write to
      // the clipboard, so an automatic copy here would fail on iOS.
      setCopyOnly(true);
    }
  };

  return (
    <Button
      className={className}
      variant="outline"
      size="lg"
      onClick={() => {
        if (copyOnly) copy();
        else void share();
      }}
    >
      {copyOnly ? (
        <RiFileCopyLine className="size-4" aria-hidden="true" />
      ) : (
        <RiShareLine className="size-4" aria-hidden="true" />
      )}
      {copyOnly ? <Trans>Copy receipt</Trans> : <Trans>Share receipt</Trans>}
    </Button>
  );
}
