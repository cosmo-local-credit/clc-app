import { createFileRoute } from "@tanstack/react-router";
import { parseReviewSearch, ReviewsPage } from "#/features/reviews/reviews-page";

export const Route = createFileRoute("/_shell/reviews")({
  validateSearch: parseReviewSearch,
  component: function ReviewsRoute() {
    return <ReviewsPage search={Route.useSearch()} />;
  },
});
