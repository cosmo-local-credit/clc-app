import { DeskCanvas } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useReport } from "#/features/home/hooks/use-reports";
import { ReportPage } from "#/features/home/ui/report-page";

export function PostDesk({ reportId }: { reportId: string }) {
  const report = useReport(reportId);
  useDeskTrailLabel(report.data?.title);

  return (
    <DeskCanvas width="read">
      <div className="[&>div>:first-child]:hidden">
        <ReportPage reportId={reportId} />
      </div>
    </DeskCanvas>
  );
}
