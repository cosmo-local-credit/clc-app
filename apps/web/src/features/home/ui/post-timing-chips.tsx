import { POST_TIMINGS, type PostTiming } from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
import { Toggle } from "#/components/ui/toggle";
import { cn } from "#/lib/utils";

export function PostTimingChips({
  timing,
  onChange,
  labeled = false,
  headingAs = "h3",
  className,
}: {
  timing: PostTiming;
  onChange: (next: PostTiming) => void;
  labeled?: boolean;
  headingAs?: "h2" | "h3";
  className?: string;
}) {
  const { t } = useLingui();
  const headingId = useId();
  const group = (
    <div
      role="group"
      aria-label={labeled ? undefined : t`Post time`}
      aria-labelledby={labeled ? headingId : undefined}
      className="flex flex-wrap gap-2"
    >
      {POST_TIMINGS.map((value) => (
        <Toggle
          key={value}
          variant="outline"
          pressed={timing === value}
          onPressedChange={(nextPressed) => {
            if (nextPressed) onChange(value);
          }}
          className="data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
        >
          {postTimingLabel(value)}
        </Toggle>
      ))}
    </div>
  );

  if (!labeled) return <div className={className}>{group}</div>;

  return (
    <section aria-labelledby={headingId} className={cn("grid gap-2", className)}>
      <SectionHeading id={headingId} variant="group" as={headingAs}>
        <Trans>Time</Trans>
      </SectionHeading>
      {group}
    </section>
  );
}

function postTimingLabel(value: PostTiming) {
  switch (value) {
    case "future":
      return <Trans>Future</Trans>;
    case "past":
      return <Trans>Past</Trans>;
    case "all":
      return <Trans>All</Trans>;
  }
}
