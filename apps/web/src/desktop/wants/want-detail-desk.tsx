import { Navigate } from "@tanstack/react-router";

/**
 * On desktop a Want is the market's Wants list with that Want open in the
 * inspector, the same `?want=` param the phone sheet uses. Replace, so Back
 * skips the bare `/wants/$wantId` entry.
 */
export function WantDetailDesk({ wantId }: { wantId: string }) {
  return <Navigate to="/market" search={{ scope: "wants", view: "list", want: wantId }} replace />;
}
