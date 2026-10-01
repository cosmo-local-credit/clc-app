import { Trans, useLingui } from "@lingui/react/macro";
import { RiShareLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";

/**
 * Shares a confirmed receipt as text plus a block-explorer link.
 *
 * Prefers the native share sheet and falls back to copying the same text. The
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
      if (error instanceof Error && error.name !== "AbortError") copy();
    }
  };

  return (
    <Button className={className} variant="outline" onClick={() => void share()}>
      <RiShareLine className="size-4" aria-hidden="true" />
      <Trans>Share receipt</Trans>
    </Button>
  );
}
