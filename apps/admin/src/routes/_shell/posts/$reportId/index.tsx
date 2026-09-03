import { createFileRoute } from "@tanstack/react-router";
import { PostDetailPage } from "#/features/posts/post-detail-page";

export const Route = createFileRoute("/_shell/posts/$reportId/")({
  component: () => <PostDetailPage reportId={Route.useParams().reportId} />,
});
