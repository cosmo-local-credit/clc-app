import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

/**
 * Says that what is on screen came from a successful earlier fetch and a later
 * one failed.
 *
 * Paired with keeping the rows rather than replacing them: an operator mid-task
 * loses their place if a background refresh failure blanks a populated table, and
 * stale rows they know are stale beat no rows at all.
 */
export function StaleNotice({ message }: { message: string }) {
  return (
    <Alert className="border-state-pending/30 bg-state-pending/10">
      <AlertTitle>Showing data that may be out of date</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
