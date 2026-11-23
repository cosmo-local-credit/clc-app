import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";

/** Native sharing with an explicit, gesture-safe copy fallback after a failure. */
export function useShareLink({ title, path }: { title: string; path: string }) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);

  function link() {
    return new URL(path, window.location.origin).href;
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
      await navigator.share({ title, url: link() });
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
