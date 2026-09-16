import { isExternalMarkdownHref, safeMarkdownHref } from "@clc/core/features/reports/logic";
import type { MarkdownInput } from "@tanstack/markdown";
import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "#/lib/utils.ts";

/**
 * A post body, rendered onto this app's mobile type scale.
 *
 * `allowHtml` is never passed, so a raw `<script>` in an imported body is
 * rendered as text. Nothing here uses `dangerouslySetInnerHTML`.
 *
 * The mapping is app-private on purpose: `apps/admin` has its own, over its own
 * scale. Only the URL rule is shared, because it is a security rule and two
 * copies is how one of them ends up wrong.
 */
export function MarkdownContent({
  children,
  className,
}: {
  children: MarkdownInput;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 text-[0.9375rem] leading-6", className)}>
      <Markdown components={components}>{children}</Markdown>
    </div>
  );
}

/** Long words break rather than pushing the 360px viewport sideways. */
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

/**
 * A table wide enough to overflow scrolls inside its own container. The page
 * body must never scroll horizontally.
 */
function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

/** Inline code and fenced blocks reach the same tag; only the block has a language. */
function Code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
  const block = typeof className === "string" && className.startsWith("language-");

  return (
    <code
      {...props}
      className={cn(
        "font-mono",
        block
          ? "block text-[0.8125rem] leading-5 whitespace-pre-wrap"
          : "bg-muted px-1 py-0.5 text-[0.8125rem]",
        WRAP,
        className,
      )}
    >
      {children}
    </code>
  );
}

const components: MarkdownComponents = {
  // The largest heading inside a body is h3: the screen title is the h1, and a
  // post that outranked it would break the page hierarchy.
  h1: ({ children }) => (
    <h3 className="mt-5 font-heading text-[1.125rem] font-semibold leading-snug">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 font-heading text-[1.125rem] font-semibold leading-snug">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 font-heading text-base font-semibold leading-snug">{children}</h4>
  ),
  h4: ({ children }) => (
    <h5 className="mt-4 font-heading text-sm font-semibold leading-snug">{children}</h5>
  ),
  h5: ({ children }) => (
    <h6 className="mt-4 font-heading text-sm font-semibold leading-snug">{children}</h6>
  ),
  h6: ({ children }) => (
    <h6 className="mt-4 font-heading text-sm font-semibold leading-snug">{children}</h6>
  ),
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
    <th style={style} className="border border-border bg-muted px-2 py-1.5 font-semibold">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className={cn("border border-border px-2 py-1.5 align-top", WRAP)}>
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto border border-border bg-card p-3">{children}</pre>
  ),
  code: Code,
  hr: () => <hr className="border-border" />,
  // Images live in report_images and are rendered by the gallery, never from the
  // body: a Markdown image would escape the carousel and the size metadata.
  img: () => null,
};
