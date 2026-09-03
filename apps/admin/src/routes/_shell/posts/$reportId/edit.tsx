import { createFileRoute } from "@tanstack/react-router";
import { PostEditorPage } from "#/features/posts/post-editor-page";

export const Route = createFileRoute("/_shell/posts/$reportId/edit")({
  component: () => <PostEditorPage mode="edit" reportId={Route.useParams().reportId} />,
});
