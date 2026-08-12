import { Link, useRouterState } from "@tanstack/react-router";

import { PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";

/**
 * What an operator sees at a URL this console does not serve.
 *
 * The path is echoed back because the usual cause is a stale bookmark or a
 * hand-edited address, and knowing which URL failed is the whole diagnosis.
 */
export function NotFoundPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="No such page" description="This console has no route for that address." />

      <div className="border border-border bg-card p-4">
        <p className="font-data text-sm break-all">{pathname}</p>
      </div>

      <Button variant="outline" className="self-start" render={<Link to="/" />}>
        Back to overview
      </Button>
    </div>
  );
}
