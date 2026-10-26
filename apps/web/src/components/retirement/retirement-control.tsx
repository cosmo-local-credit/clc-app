import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { resourceRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RiArchiveLine } from "react-icons/ri";
import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { retirementClient } from "#/lib/api/retirement";
import { RetirementRequestForm } from "./retirement-request-form";
import { RetirementRequestList } from "./retirement-request-list";

/** Shared owner control: requesting retirement must never remove the active page. */
export function RetirementControl({
  type,
  address,
  name,
  viewer,
  active = true,
}: {
  type: RetirementResourceType;
  address: string;
  name: string;
  viewer: string;
  active?: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const history = useQuery(
    resourceRetirementRequestsQueryOptions(retirementClient, type, address, viewer),
  );
  const pending = history.data?.some((request) => request.status === "pending") === true;
  const title = pending
    ? t`Retirement requested`
    : active
      ? t`Request retirement`
      : t`Retirement history`;

  return (
    <>
      <ActionRow
        icon={<RiArchiveLine className="size-4" aria-hidden="true" />}
        label={title}
        tone={pending || !active ? "default" : "destructive"}
        onClick={() => setOpen(true)}
      />
      <SheetRoot open={open} onOpenChange={setOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {title}: {name}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              {history.isPending ? (
                <p role="status">
                  <Trans>Loading retirement requests…</Trans>
                </p>
              ) : history.isError ? (
                <div role="alert" className="space-y-2">
                  <p>
                    <Trans>Could not load retirement requests.</Trans>
                  </p>
                  <Button
                    variant="outline"
                    tap
                    pending={history.isFetching}
                    onClick={() => void history.refetch()}
                  >
                    <Trans>Retry</Trans>
                  </Button>
                </div>
              ) : (
                <>
                  {pending ? (
                    <p role="status" className="text-sm">
                      <Trans>
                        Retirement requested — awaiting admin review. This resource stays active
                        until approval.
                      </Trans>
                    </p>
                  ) : active && open ? (
                    <RetirementRequestForm
                      type={type}
                      address={address}
                      viewer={viewer}
                      onSubmitted={() => void history.refetch()}
                    />
                  ) : null}
                  {history.data.length > 0 ? (
                    <RetirementRequestList requests={history.data} viewer={viewer} />
                  ) : null}
                </>
              )}
              <Button
                type="button"
                variant="outline"
                tap
                className="w-full"
                onClick={() => setOpen(false)}
              >
                <Trans>Close</Trans>
              </Button>
            </div>
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
