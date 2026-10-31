import type { ActivityKind } from "@clc/api/features/accounts/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiCloseLine, RiFilter3Line } from "react-icons/ri";

import { ACTIVITY_KIND_ORDER } from "#/lib/navigation/activity-search";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";

export function ActivityFilterSheet({
  types,
  onApply,
}: {
  types: readonly ActivityKind[];
  onApply: (types: readonly ActivityKind[]) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<readonly ActivityKind[]>(types);
  const labels: Record<ActivityKind, string> = {
    creation: t`Creation`,
    sent: t`Sent`,
    received: t`Received`,
    swapped: t`Swapped`,
    deposited: t`Deposits`,
    withdrawn: t`Withdrawals`,
    fee_withdrawn: t`Fee withdrawals`,
    pool_payout: t`Pay Out`,
  };

  const changeOpen = (next: boolean) => {
    if (next) setDraft(types);
    setOpen(next);
  };
  const toggle = (kind: ActivityKind, checked: boolean) => {
    setDraft((previous) =>
      checked
        ? ACTIVITY_KIND_ORDER.filter((entry) => entry === kind || previous.includes(entry))
        : previous.filter((entry) => entry !== kind),
    );
  };
  const apply = () => {
    onApply(draft);
    setOpen(false);
  };
  const clear = () => {
    setDraft([]);
    onApply([]);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={t`Filters`}
        title={t`Filters`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => changeOpen(true)}
        className="relative border-0 text-foreground"
      >
        <RiFilter3Line className="size-5" aria-hidden="true" />
        {types.length > 0 ? (
          <Badge
            aria-hidden="true"
            size="sm"
            className="absolute end-1 top-1 h-4 min-w-4 justify-center border-primary bg-primary px-0.5 font-mono text-primary-foreground tabular-nums"
          >
            {types.length}
          </Badge>
        ) : null}
      </Button>

      <SheetRoot open={open} onOpenChange={changeOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            <SheetHeader className="flex-row items-center justify-between gap-3">
              <SheetTitle>
                <Trans>Filters</Trans>
              </SheetTitle>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={t`Close filters`}
                onClick={() => changeOpen(false)}
              >
                <RiCloseLine className="size-5" aria-hidden="true" />
              </Button>
            </SheetHeader>
            <fieldset className="border-y border-border px-4 py-3">
              <legend className="sr-only">{t`Activity`}</legend>
              {ACTIVITY_KIND_ORDER.map((kind) => (
                <label key={kind} className="flex min-h-11 items-center gap-3 text-sm">
                  <Checkbox
                    checked={draft.includes(kind)}
                    onCheckedChange={(checked) => toggle(kind, checked === true)}
                  />
                  <span>{labels[kind]}</span>
                </label>
              ))}
            </fieldset>
            <SheetFooter className="grid grid-cols-2">
              <Button variant="outline" tap onClick={clear}>
                <Trans>Clear filters</Trans>
              </Button>
              <Button tap onClick={apply}>
                <Trans>Apply filters</Trans>
              </Button>
            </SheetFooter>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
