import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Share a catalog's link. After the share sheet fails once, the action
 * becomes Copy link.
 */
export function useCatalogShare({ id, name }: { id: string; name: string }) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);

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
  return {
    copyOnly,
    label: copyOnly ? t`Copy link` : t`Share`,
    activate: () => {
      if (copyOnly) copy();
      else void share();
    },
  };
}
