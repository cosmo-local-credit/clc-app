import { isExternalMarkdownHref, safeMarkdownHref } from "@clc/core/features/reports/logic";
import type { MarkdownInput } from "@tanstack/markdown";
import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * A post body, rendered onto the console's ops scale.
 *
 * `allowHtml` is never passed, so a raw `<script>` in an imported body is
 * rendered as text. Nothing here uses `dangerouslySetInnerHTML`.
 *
 * A separate mapping from `apps/web`'s, over a different scale and denser
 * spacing. Only the URL rule is shared — it is a security rule.
 */
export function MarkdownContent({
  children,
  className,
}: {
  children: MarkdownInput;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 text-sm leading-6", className)}>
      <Markdown components={components}>{children}</Markdown>
    </div>
  );
}

const WRAP = "[overflow-wrap:anywhere]";

function Anchor({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
  const safe = safeMarkdownHref(href);
  const external = safe !== undefined && isExternalMarkdownHref(safe);

  return (
    <a
      {...props}
      href={safe}
      {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
      className={cn(
        "font-medium text-primary underline underline-offset-2",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        WRAP,
      )}
    >
      {children}
    </a>
  );
}

/** A wide table scrolls inside its own container rather than the page. */
function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

function Code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
  const block = typeof className === "string" && className.startsWith("language-");

  return (
    <code
      {...props}
      className={cn(
        "font-mono",
        block ? "block text-xs leading-5 whitespace-pre-wrap" : "bg-muted px-1 py-0.5 text-xs",
        WRAP,
        className,
      )}
    >
      {children}
    </code>
  );
}

const components: MarkdownComponents = {
  // The review page owns the h1 and h2; a body starts at h3 so it cannot
  // outrank the screen it sits on.
  h1: ({ children }) => <h3 className="mt-5">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-5">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 text-base">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-4 text-sm">{children}</h5>,
  h5: ({ children }) => <h6 className="mt-4 text-sm">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-4 text-sm">{children}</h6>,
  p: ({ children }) => <p className={cn("leading-6", WRAP)}>{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className={cn("leading-6", WRAP)}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: Anchor,
  table: Table,
  th: ({ children, style }) => (
    <th
      style={style}
      className="border-b border-border bg-muted px-2 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className={cn("border-b border-border px-2 py-1.5 align-top", WRAP)}>
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto border border-border bg-card p-3">{children}</pre>
  ),
  code: Code,
  hr: () => <hr className="border-border" />,
  // Images live in report_images and are rendered by the media panel, never
  // from the body.
  img: () => null,
};
