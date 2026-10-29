import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { MyPostsPage } from "#/features/posts/ui/my-posts-page";

const MyPostsDesk = lazy(() =>
  import("#/desktop/posts/my-posts-desk").then((module) => ({ default: module.MyPostsDesk })),
);

export const Route = createFileRoute("/_nav/posts/mine")({
  staticData: { navOwner: "posts", desktop: "fill" },
  component: MyPostsRoute,
});

function MyPostsRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <div className="min-h-[100svh] bg-background pb-bottom-nav text-foreground">
            <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
              <MyPostsPage />
            </main>
          </div>
        }
        desktop={<MyPostsDesk />}
      />
    </AuthenticatedRoute>
  );
}
