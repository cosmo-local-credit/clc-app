import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiFileCopyLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function CatalogShareButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);
  const label = copyOnly ? t`Copy link` : t`Share`;
  const Icon = copyOnly ? RiFileCopyLine : RiShareLine;

  function link() {
    return `${window.location.origin}/catalogs/${encodeURIComponent(id)}`;
  }

  function copy() {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy link`);
      return;
    }
    void navigator.clipboard
      .writeText(link())
      .then(() => toast.success(t`Link copied`))
      .catch(() => toast.error(t`Couldn't copy link`));
  }

  async function share() {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({ title: name, url: link() });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopyOnly(true);
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("border-0 text-muted-foreground", className)}
      aria-label={label}
      onClick={() => {
        if (copyOnly) copy();
        else void share();
      }}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
