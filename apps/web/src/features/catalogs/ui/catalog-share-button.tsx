import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";

export function CatalogShareButton({ id, name }: { id: string; name: string }) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t`Link copied`);
    } catch {
      toast.error(t`Couldn't copy link`);
    }
  }
  async function share() {
    const url = `${window.location.origin}/catalogs/${encodeURIComponent(id)}`;
    if (copyOnly || !navigator.share) {
      await copy(url);
      return;
    }
    try {
      await navigator.share({ title: name, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopyOnly(true);
    }
  }
  return (
    <Button variant="outline" tap onClick={() => void share()}>
      {copyOnly ? <Trans>Copy link</Trans> : <Trans>Share</Trans>}
    </Button>
  );
}
