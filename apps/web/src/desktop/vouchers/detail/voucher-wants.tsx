import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { WantPicture } from "#/components/wants/want-row";
import { DeskPanel, DeskRow, DeskRowList, DeskSection } from "#/desktop/ui/page";
import { useVoucherWants } from "#/features/wants/hooks/use-voucher-wants";
import { useReportSectionCount } from "./voucher-section-bits";

export function VoucherWantsDesk({
  address,
  layout,
  onCount,
}: {
  address: string;
  layout: "page" | "panel";
  onCount?: (count: number | undefined) => void;
}) {
  const { query, wants } = useVoucherWants(address);
  useReportSectionCount(onCount, query.isSuccess && !query.hasNextPage ? wants.length : undefined);
  const content = (
    <div className="grid gap-3">
      {query.isPending ? (
        <DeskPanel>
          <p className="text-sm text-muted-foreground">
            <Trans>Loading Wants…</Trans>
          </p>
        </DeskPanel>
      ) : null}
      {query.isError ? (
        <DeskPanel className="grid justify-items-start gap-3">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load Wants.</Trans>
          </p>
          <Button variant="outline" pending={query.isFetching} onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </DeskPanel>
      ) : null}
      {wants.length ? (
        <DeskRowList>
          {wants.map((want) => (
            <Link
              key={want.id}
              to="/wants/$wantId"
              params={{ wantId: want.id }}
              className="block hover:bg-muted/60"
            >
              <DeskRow
                lead={<WantPicture want={want} size="size-10" />}
                title={<span dir="auto">{want.name}</span>}
                subtitle={<span dir="auto">{want.locationName}</span>}
                trail={
                  want.state === "scheduled" || want.tags.length ? (
                    <span className="flex max-w-56 gap-1 overflow-hidden">
                      {want.state === "scheduled" ? (
                        <span className="shrink-0 text-2xs font-semibold text-want-ink">
                          <Trans>Scheduled</Trans>
                        </span>
                      ) : null}
                      {want.tags.slice(0, 3).map((tag) => (
                        <TagBadge key={tag} tag={tag} size="sm" />
                      ))}
                    </span>
                  ) : undefined
                }
              />
            </Link>
          ))}
        </DeskRowList>
      ) : !query.isPending && !query.isError ? (
        <DeskPanel>
          <p className="text-sm text-muted-foreground">
            <Trans>No Wants yet.</Trans>
          </p>
        </DeskPanel>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
  return layout === "page" ? (
    <DeskSection title={<Trans>Wants</Trans>}>{content}</DeskSection>
  ) : (
    content
  );
}
