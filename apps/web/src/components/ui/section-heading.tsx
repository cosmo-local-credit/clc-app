import type * as React from "react";

import { cn } from "#/lib/utils.ts";

const VARIANT_CLASS = {
  /** A content section: Holdings, Reviews, Recent collections. */
  section: "font-heading text-base font-semibold",
  /** The label above a grouped panel of rows, as in Settings. */
  group: "font-heading text-sm font-semibold",
} as const;

type SectionHeadingProps = React.ComponentProps<"h2"> & {
  variant?: keyof typeof VARIANT_CLASS;
  /** The document level. The look comes from `variant`, never the level. */
  as?: "h2" | "h3" | "h4";
};

/** The two section heading levels below the page title. */
export function SectionHeading({
  variant = "section",
  as: Heading = "h2",
  className,
  ...props
}: SectionHeadingProps) {
  return <Heading className={cn(VARIANT_CLASS[variant], className)} {...props} />;
}
