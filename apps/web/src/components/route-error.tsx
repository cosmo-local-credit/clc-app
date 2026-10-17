import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { isModuleLoadError, reloadOnceForStaleChunk } from "#/lib/stale-chunk-recovery";

// Root error boundary, wired as the root route `errorComponent`. TanStack Router
// renders this in place of the app when a route subtree throws — that is
// *outside* the app providers (i18n / web3 live inside AppContent), so this
// component must not use <Trans>/useLingui or any provider-backed hook. Copy is
// intentionally plain English for that reason.
export function RouteError({ error }: { error: unknown }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (isModuleLoadError(error)) {
      // Stale chunk after a deploy: reload once onto the fresh build. If this
      // chunk already reloaded once (persistent failure), fall through to the
      // manual error UI below instead of looping.
      setReloading(reloadOnceForStaleChunk(error));
    }
  }, [error]);

  if (reloading) {
    // A full reload onto the current deploy is imminent; show nothing jarring.
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 pb-12 pt-20">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm">Please reload the app and try again.</p>
        <Button size="lg" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
