import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskCanvas, DeskDetail } from "#/desktop/ui/page";
import { useReport } from "#/features/home/hooks/use-reports";
import { ReportPage } from "#/features/home/ui/report-page";

/**
 * A post as a reading column with its details beside it. The phone page is
 * mounted twice over the same cached queries: the main column keeps the story
 * (header, gallery, text), the side column keeps the metadata sections. Each
 * copy hides what the other shows, so every section keeps its own behaviour.
 */
export function PostDesk({ reportId }: { reportId: string }) {
  const report = useReport(reportId);
  useDeskTrailLabel(report.data?.title);

  if (!report.data) {
    return (
      <DeskCanvas width="read" className="grid-cols-[minmax(0,720px)]">
        <div className="[&>div>:first-child]:hidden">
          <ReportPage reportId={reportId} />
        </div>
      </DeskCanvas>
    );
  }

  return (
    <DeskDetail
      main={
        <div className="max-w-[720px] [&>div>:first-child]:hidden [&_article>section]:hidden [&_article]:space-y-4 [&_article>p]:font-medium">
          <ReportPage reportId={reportId} />
        </div>
      }
      side={
        <div className="[&>div>:first-child]:hidden [&_article>:not(section)]:hidden [&_article]:space-y-6">
          <ReportPage reportId={reportId} />
        </div>
      }
    />
  );
}
