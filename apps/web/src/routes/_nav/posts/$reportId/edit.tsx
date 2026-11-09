import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";

const PostEditorDesk = lazy(() =>
  import("#/desktop/posts/post-editor-desk").then((module) => ({
    default: module.PostEditorDesk,
  })),
);

export const Route = createFileRoute("/_nav/posts/$reportId/edit")({
  staticData: { navOwner: "posts", desktop: "fill" },
  component: EditPostRoute,
});

function EditPostRoute() {
  const { reportId } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <div className="min-h-[100svh] bg-background pb-bottom-nav text-foreground">
            <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
              <PostEditorPage mode="edit" reportId={reportId} />
            </main>
          </div>
        }
        desktop={<PostEditorDesk mode="edit" reportId={reportId} />}
      />
    </AuthenticatedRoute>
  );
}
