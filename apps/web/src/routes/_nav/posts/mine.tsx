import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { MyPostsPage } from "#/features/posts/ui/my-posts-page";

export const Route = createFileRoute("/_nav/posts/mine")({
  staticData: { navOwner: "posts" },
  component: MyPostsRoute,
});

function MyPostsRoute() {
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <MyPostsPage />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
