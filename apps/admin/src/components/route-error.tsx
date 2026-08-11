import { Button } from "#/components/ui/button";

// Root error boundary, wired as the root route `errorComponent`. TanStack Router
// renders this in place of the app when a route subtree throws — outside the app
// shell and its providers — so it must not use any provider-backed hook.
export function RouteError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";

  return (
    <div className="flex min-h-screen flex-col items-start gap-4 bg-background p-6">
      <div className="space-y-1">
        <h1>Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The console hit an error it could not recover from.
        </p>
      </div>
      <pre className="max-w-full overflow-x-auto border border-border bg-card p-4 font-mono text-xs text-muted-foreground">
        {message}
      </pre>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}
