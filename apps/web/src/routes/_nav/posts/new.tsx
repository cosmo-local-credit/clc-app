import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";

export const Route = createFileRoute("/_nav/posts/new")({
  staticData: { navOwner: "posts" },
  component: NewPostRoute,
});

function NewPostRoute() {
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <PostEditorPage mode="create" />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
