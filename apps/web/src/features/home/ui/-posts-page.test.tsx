import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { PostsPage } from "./posts-page";

describe("PostsPage", () => {
  it("renders the Posts placeholder describing impact reports", () => {
    render(<PostsPage />);
    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.getByText(/impact reports/i)).toBeTruthy();
  });
});
