import { Button } from "#/components/ui/button";

// Like RouteError, this renders outside the app providers. Keep it independent
// of i18n, Web3, and other provider-backed hooks.
export function RouteNotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-background px-6 pb-12 pt-20">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="font-mono text-muted-foreground text-sm">404</p>
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">Page not found</h1>
        <p className="text-muted-foreground text-sm">
          The address does not match a page in this app.
        </p>
        <Button asChild className="h-11">
          <a href="/">Go home</a>
        </Button>
      </div>
    </main>
  );
}
