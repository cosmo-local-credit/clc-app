import { POSTED_WITHIN, type PostedWithin } from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
import { Toggle } from "#/components/ui/toggle";
import { cn } from "#/lib/utils";

export function PostedWithinChips({
  posted,
  onChange,
  labeled = false,
  headingAs = "h3",
  className,
}: {
  posted: PostedWithin;
  onChange: (next: PostedWithin) => void;
  labeled?: boolean;
  headingAs?: "h2" | "h3";
  className?: string;
}) {
  const { t } = useLingui();
  const headingId = useId();
  const group = (
    <div
      role="group"
      aria-label={labeled ? undefined : t`Posted within`}
      aria-labelledby={labeled ? headingId : undefined}
      className="flex flex-wrap gap-2"
    >
      {POSTED_WITHIN.map((value) => (
        <Toggle
          key={value}
          variant="outline"
          pressed={posted === value}
          onPressedChange={(nextPressed) => {
            if (nextPressed) onChange(value);
          }}
          className="data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
        >
          {postedWithinLabel(value)}
        </Toggle>
      ))}
    </div>
  );

  if (!labeled) {
    return <div className={className}>{group}</div>;
  }

  return (
    <section aria-labelledby={headingId} className={cn("grid gap-2", className)}>
      <SectionHeading id={headingId} variant="group" as={headingAs}>
        <Trans>Posted within</Trans>
      </SectionHeading>
      {group}
    </section>
  );
}

function postedWithinLabel(value: PostedWithin) {
  switch (value) {
    case "1m":
      return <Trans>1 month</Trans>;
    case "3m":
      return <Trans>3 months</Trans>;
    case "6m":
      return <Trans>6 months</Trans>;
    case "1y":
      return <Trans>Year</Trans>;
    case "all":
      return <Trans>All time</Trans>;
  }
}
