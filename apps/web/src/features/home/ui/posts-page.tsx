import { Trans } from "@lingui/react/macro";
import { RiArticleLine } from "react-icons/ri";

export function PostsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1>
          <Trans>Posts</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Placeholder screen</Trans>
        </p>
      </div>
      <section className="border border-border bg-card p-4">
        <div className="flex size-9 items-center justify-center bg-muted text-foreground">
          <RiArticleLine className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg">
          <Trans>Coming next</Trans>
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>
            Impact reports from pools, service providers, and stewards will appear here.
          </Trans>
        </p>
      </section>
    </div>
  );
}
