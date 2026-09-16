import { createFileRoute } from "@tanstack/react-router";
import { PostsPage } from "#/features/posts/posts-page";
import { parsePostSearch } from "#/features/posts/post-search";

export const Route = createFileRoute("/_shell/posts/")({
  validateSearch: parsePostSearch,
  component: () => <PostsPage search={Route.useSearch()} />,
});
