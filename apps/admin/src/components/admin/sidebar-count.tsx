import { Badge } from "#/components/ui/badge";

/**
 * A sidebar status counter: in the row, after the label, and absent when
 * nothing is waiting or the count is unknown.
 */
export function SidebarCount({
  count,
  label,
  title,
}: {
  count: number | undefined;
  /** Spoken with the number, e.g. "pending retirement requests". */
  label: string;
  title: string;
}) {
  if (count === undefined || count < 1) return null;
  return (
    <Badge
      variant="destructive"
      aria-label={`${count} ${label}`}
      title={title}
      className="ml-auto h-5 min-w-5 justify-center px-1 font-mono group-data-[collapsible=icon]:hidden"
    >
      {count}
    </Badge>
  );
}
