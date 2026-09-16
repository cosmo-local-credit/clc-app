import { useLingui } from "@lingui/react/macro";
import { Suspense, lazy, useEffect, useState } from "react";

import type { MarkdownEditorProps } from "#/components/ui/markdown-editor-lexical";

export type { MarkdownEditorProps };

const MarkdownEditorLexical = lazy(() =>
  import("#/components/ui/markdown-editor-lexical").then((module) => ({
    default: module.MarkdownEditorLexical,
  })),
);

/**
 * The Markdown editor as the rest of the app sees it: a controlled field that
 * takes a Markdown string and gives one back.
 *
 * Lexical is behind a client-only lazy boundary. It owns a `contentEditable`
 * and reads the DOM selection, so it cannot render on the server, and it is the
 * heaviest thing on either screen that uses it — neither the post editor nor
 * the voucher sheet should pay for it before the screen is on. The fallback is
 * the same box at the same height, so nothing moves when the chunk lands.
 */
export function MarkdownEditor(props: MarkdownEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <MarkdownEditorFallback />;

  return (
    <Suspense fallback={<MarkdownEditorFallback />}>
      <MarkdownEditorLexical {...props} />
    </Suspense>
  );
}

function MarkdownEditorFallback() {
  const { t } = useLingui();
  return (
    <output aria-busy="true" className="block border border-border bg-card">
      <div className="h-13 border-border border-b" />
      <div className="h-40" />
      <span className="sr-only">{t`Loading the editor…`}</span>
    </output>
  );
}
